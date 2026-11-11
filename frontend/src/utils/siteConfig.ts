/** The address readers and advertisers write to. It only exists once the owner
 *  puts it in the build environment, so a page can never show a made-up contact. */
export const contactEmail: string = String(import.meta.env.VITE_CONTACT_EMAIL || '').trim()

/** The date these pages were written. Edit it when the text changes, not on
 *  every build, so the page never claims an update that did not happen. */
export const publisherPagesUpdated = 'November 11, 2026'
