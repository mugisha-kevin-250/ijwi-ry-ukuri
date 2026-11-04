import { Link } from 'react-router-dom'
import { Tag } from 'lucide-react'
import { cn } from '../../utils/cn'

interface CategoryCardProps {
  category: {
    _id: string
    name: string
    slug: string
    description?: string
  }
  label: string
  image?: string
  className?: string
}

export default function CategoryCard({ category, label, image, className }: CategoryCardProps) {
  return (
    <Link
      to={`/category/${category.slug}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-brand-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-700',
        className
      )}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-[#062b52] via-[#08375f] to-[#0b5d7a]">
        {image ? (
          <img
            src={image}
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
      </div>
      {category.description && (
        <p className="flex-1 px-4 py-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{category.description}</p>
      )}
    </Link>
  )
}
