import { useEffect } from 'react'

export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title
    const metaDescription = getMetaDescriptionTag()
    const previousDescription = metaDescription?.getAttribute('content') ?? ''

    document.title = title
    metaDescription?.setAttribute('content', description)

    return () => {
      document.title = previousTitle
      metaDescription?.setAttribute('content', previousDescription)
    }
  }, [description, title])
}

function getMetaDescriptionTag() {
  let tag = document.querySelector('meta[name="description"]')

  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', 'description')
    document.head.appendChild(tag)
  }

  return tag
}
