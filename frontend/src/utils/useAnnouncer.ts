import { useSyncExternalStore } from 'react'
import { announcerState, subscribeToAnnouncer, type AnnouncerState } from './newsAnnouncer'

/**
 * Reads the one announcer the whole site shares, so a bulletin that started on
 * the radio page keeps playing while the reader opens a story, and the header
 * button can show the truth: something is speaking right now.
 */
export function useAnnouncer(): AnnouncerState {
  return useSyncExternalStore(subscribeToAnnouncer, announcerState, announcerState)
}
