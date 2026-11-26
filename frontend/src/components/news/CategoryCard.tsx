import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Tag } from 'lucide-react'
import { cn } from '../../utils/cn'
import { categoryHref, search4kCategoryImage, type CommonsCategoryImage } from '../../data/categoryVisuals'

interface CategoryCardProps {
  category: {
    _id: string
    name: string
    slug: string
    description?: string
  }
  label: string
  image?: string
  /** Sub-sections of this section, offered as chips under the card. */
  subsections?: { label: string; href: string }[]
  className?: string
}

export default function CategoryCard({ category, label, image, subsections = [], className }: CategoryCardProps) {
  const href = categoryHref(category)
  const [remoteImage, setRemoteImage] = useState<CommonsCategoryImage | null>(null)
  useEffect(() => {
    let active = true
    setRemoteImage(null)
    search4kCategoryImage(label || category.name)
      .then((result) => { if (active) setRemoteImage(result) })
      .catch((error) => console.warn('4K category image lookup unavailable:', error))
    return () => { active = false }
  }, [category.slug, category.name, label])
  const displayImage = remoteImage?.url || image
  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-brand-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-700',
        className
      )}
    >
      <Link to={href} className="relative block aspect-[16/9] overflow-hidden bg-gradient-to-br from-[#062b52] via-[#08375f] to-[#0b5d7a]">
        {displayImage ? (
          <img
            src={displayImage}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-white/70">
            <Tag className="h-10 w-10" aria-hidden="true" />
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-3 pt-8">
          <h3 className="text-lg font-bold text-white">{label}</h3>
        </div>
      </Link>
      {remoteImage?.pageUrl && (
        <div className="px-4 pt-2 text-[10px] text-gray-500 dark:text-gray-400">
          <a href={remoteImage.pageUrl} target="_blank" rel="noreferrer" className="hover:underline">
            Image: {remoteImage.credit} · verified {remoteImage.width}×{remoteImage.height} px
          </a>
        </div>
      )}
      {category.description && (
        <Link to={href} className="flex-1 px-4 py-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {category.description}
        </Link>
      )}
      {subsections.length > 0 && (
        <div className={cn('flex flex-wrap gap-1.5 px-4 py-3', !category.description && 'border-t border-gray-100 dark:border-gray-700')}>
          {subsections.map((sub) => (
            <Link
              key={sub.href}
              to={sub.href}
              className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-brand-50 hover:text-brand-700 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
            >
              {sub.label}
            </Link>
          ))}
        </div>
      )}
    </article>
  )
}
