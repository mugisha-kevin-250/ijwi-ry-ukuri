import { Loading } from './Loading'
import { useI18n } from '../../context/I18nContext'

/**
 * What the page area shows while the page the reader asked for is still arriving.
 *
 * This exists because the site is now loaded in pieces rather than as one file:
 * the newsroom's own screens - the admin's dashboard with its charts, the writer's
 * editor with its form library, the live studio with its socket client - are
 * several hundred kilobytes that a reader who came for a headline has no
 * particular use for, and making a phone on a Rwandan network download all of
 * them before it draws the home page was the wrong trade.
 *
 * Two rules made here, both about what a swap is allowed to do to the rest of the
 * screen. It keeps the chrome: this sits inside the layout, so the header, the
 * footer and a bulletin that is already speaking all stay exactly where they are
 * while the page underneath arrives. And it reserves the height it will be
 * replaced by, so the layout does not jump when the real content lands - a page
 * that moves under a reader's thumb is a page they mis-tap.
 */
export default function RouteFallback() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status">
      <Loading size="md" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}
