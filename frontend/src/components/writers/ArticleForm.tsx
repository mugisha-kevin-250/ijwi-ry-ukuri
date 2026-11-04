import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../common/Button'
import { Input } from '../common/Input'
import { Textarea } from '../common/Textarea'
import { Select } from '../common/Select'
import { Card, CardContent, CardHeader, CardTitle } from '../common/Card'
import type { Category } from '../../types'

const articleSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200, 'Title must be less than 200 characters'),
  summary: z.string().min(20, 'Summary must be at least 20 characters').max(500, 'Summary must be less than 500 characters'),
  content: z.string().min(100, 'Content must be at least 100 characters'),
  category: z.string().min(1, 'Please select a category'),
  tags: z.array(z.string()).optional(),
  featuredImage: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
})

export type ArticleFormData = z.infer<typeof articleSchema>

interface ArticleFormProps {
  initialData?: Partial<ArticleFormData>
  categories: Category[]
  onSubmit: (data: ArticleFormData) => Promise<void>
  isLoading?: boolean
  submitLabel?: string
  showPublishButton?: boolean
  onPublish?: () => Promise<void>
}

export default function ArticleForm({
  initialData,
  categories,
  onSubmit,
  isLoading = false,
  submitLabel = 'Save Draft',
  showPublishButton = false,
  onPublish,
}: ArticleFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<ArticleFormData>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: '',
      summary: '',
      content: '',
      category: '',
      tags: [],
      featuredImage: '',
      ...initialData,
    },
  })

  const tags = watch('tags') || []

  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault()
      setValue('tags', [...tags, e.currentTarget.value.trim()], { shouldValidate: true })
      e.currentTarget.value = ''
    }
  }

  const removeTag = (tagToRemove: string) => {
    setValue('tags', tags.filter((tag) => tag !== tagToRemove), { shouldValidate: true })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Article Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Input
            label="Title"
            placeholder="Enter article title"
            error={errors.title?.message}
            {...register('title')}
          />

          <Textarea
            label="Summary"
            placeholder="Write a brief summary of your article"
            rows={3}
            error={errors.summary?.message}
            {...register('summary')}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tags</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, index) => (
                <span key={index} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-sm bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-brand-900 dark:hover:text-brand-100"
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="Press Enter to add tag"
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                onKeyDown={handleTagInput}
                aria-label="Add tag"
              />
            </div>
          </div>

          <Select
            label="Category"
            placeholder="Select a category"
            options={categories.map((c) => ({ value: c._id, label: c.name }))}
            error={errors.category?.message}
            {...register('category')}
          />

          <Input
            label="Featured Image URL (optional)"
            placeholder="https://example.com/image.jpg"
            type="url"
            error={errors.featuredImage?.message}
            {...register('featuredImage')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            label="Article Content"
            placeholder="Write your article content here (Markdown supported)..."
            rows={20}
            error={errors.content?.message}
            {...register('content')}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" loading={isLoading || isSubmitting}>
          {submitLabel}
        </Button>
        {showPublishButton && onPublish && (
          <Button variant="outline" onClick={onPublish} loading={isLoading}>
            Publish
          </Button>
        )}
      </div>
    </form>
  )
}