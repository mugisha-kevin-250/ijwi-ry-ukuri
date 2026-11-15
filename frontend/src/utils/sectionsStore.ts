import { useEffect, useState } from 'react'
import { publicAPI, type SectionRecord } from '../services/api'
import { SECTIONS, type SectionNode } from '../data/sections'

/**
 * The sections as the newsroom has them today.
 *
 * `data/sections.ts` is the shipped table: it paints the header the moment the
 * HTML arrives, before any request finishes, and it carries the translation key
 * each section is printed with. The server knows one thing more - a section the
 * admin created after this build was made - so the two are folded together here
 * and the folded list is what the navigation and the section pages use.
 *
 * The table stays the spine. A server name can only override a section the table
 * already has when the table has no translation key for it, which is what keeps
 * a renamed section from losing its translated name in the other languages.
 */

function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function toNode(record: SectionRecord): SectionNode {
  const slug = String(record.slug || '').toLowerCase()
  return {
    slug,
    // No key means the name in the database is the name the reader sees.
    labelKey: String(record.labelKey || ''),
    name: String(record.name || slug),
    aliases: (Array.isArray(record.aliases) ? record.aliases : [slug]).map(String),
    children: (Array.isArray(record.children) ? record.children : []).map(toNode),
  }
}

function merge(serverList: SectionNode[]): SectionNode[] {
  const bySlug = new Map(serverList.map((node) => [normalize(node.slug), node]))

  const fromTable = SECTIONS.map((section) => {
    const found = bySlug.get(normalize(section.slug))
    if (!found) return section
    const childBySlug = new Map(found.children.map((child) => [normalize(child.slug), child]))
    return {
      ...section,
      children: section.children.map((child) => childBySlug.get(normalize(child.slug)) || child),
    }
  })

  // Everything the table has an address for is already placed, aliases included.
  const claimed = new Set<string>()
  SECTIONS.forEach((section) => {
    [section.slug, ...section.aliases].forEach((alias) => claimed.add(normalize(alias)))
    section.children.forEach((child) => [child.slug, ...child.aliases].forEach((alias) => claimed.add(normalize(alias))))
  })

  const extra = serverList.filter((node) => !claimed.has(normalize(node.slug)))
  return [...fromTable, ...extra]
}

let merged: SectionNode[] = SECTIONS
let loaded = false
let inflight: Promise<SectionNode[]> | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function fetchSections(): Promise<SectionNode[]> {
  if (!inflight) {
    inflight = publicAPI
      .getSections()
      .then((response) => {
        const list = Array.isArray(response.data?.data?.sections) ? response.data.data.sections : []
        merged = list.length ? merge(list.map(toNode)) : SECTIONS
        loaded = true
        inflight = null
        notify()
        return merged
      })
      .catch(() => {
        // A table the network has not confirmed is still a table: the header
        // keeps showing the sections this build knows about.
        loaded = true
        inflight = null
        return merged
      })
  }
  return inflight
}

/** The folded list, and a re-render when it changes. */
export function useSections(): { sections: SectionNode[]; isLoaded: boolean } {
  const [snapshot, setSnapshot] = useState(merged)

  useEffect(() => {
    const listener = () => setSnapshot(merged)
    listeners.add(listener)
    if (!loaded) void fetchSections()
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return { sections: snapshot, isLoaded: loaded }
}

/** The one address a stored category is published at, in the current list. */
export function sectionHrefIn(list: SectionNode[], category?: { slug?: string; name?: string } | null): string | null {
  if (!category) return null
  const wanted = normalize(category.slug || '') || normalize(category.name || '')
  if (!wanted) return null
  for (const section of list) {
    if (section.aliases.map(normalize).includes(wanted) || normalize(section.slug) === wanted) {
      return `/${section.slug}`
    }
    for (const child of section.children) {
      if (child.aliases.map(normalize).includes(wanted) || normalize(child.slug) === wanted) {
        return `/${section.slug}/${child.slug}`
      }
    }
  }
  return null
}

/** The section and sub-section a URL names, or nothing when it names neither. */
export function resolvePathIn(
  list: SectionNode[],
  sectionSlug?: string,
  childSlug?: string,
): { section: SectionNode; child: SectionNode | null } | null {
  const section = list.find((item) => item.slug === String(sectionSlug || '').toLowerCase())
  if (!section) return null
  if (!childSlug) return { section, child: null }
  const child = section.children.find((item) => item.slug === String(childSlug).toLowerCase())
  return child ? { section, child } : null
}

/**
 * A section name, in the language the reader is reading in.
 *
 * Sections in the shipped table are printed from their translation key; a
 * section the admin made themselves has no key, so its stored name is printed
 * as it was written. That is the honest answer - the desk named it, and we are
 * not going to guess what it is called in another language.
 */
export function sectionLabel(node: SectionNode | null | undefined, t: (key: string) => string): string {
  if (!node) return ''
  return node.labelKey ? t(node.labelKey) : node.name || node.slug
}
