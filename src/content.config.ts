import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { articleDateKey } from './features/news/article-order.mjs';
const case_studiesCollection = defineCollection({
    loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/case_studies' }),
    schema: ({ image }) => z.object({
        title: z.string(),
        cover: image(),
        imageAlt: z.string(),
      }),
    });

const newsCollection = defineCollection({
    loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/news_articles' }),
    schema: ({ image }) => z.object({
        title: z.string(),
        cover: image(),
        imageAlt: z.string(),
        figureLink: z.string(),
        articleDate: z.string().refine(
            (value) => articleDateKey(value) !== null,
            { message: 'Expected a real date in D Month YYYY format, e.g. 12 January 2026.' },
        ),
      }),
    });

const announcementCollection = defineCollection({
    loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/announcements' }),
    schema: ({ }) => z.object({
        title: z.string(),
        className: z.string()
      }),
    });

const contributorCollection = defineCollection({
    loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/contributors' }),
    schema: ({ image }) => z.object({
        name: z.string(),
        affiliation: z.string(),
        jobTitle: z.string(),
        profileLink: z.string(),
        accessionID: z.string(),
        contributorImage: image()
      }),
    });
export const collections = {
  case_studies: case_studiesCollection,
  news_articles: newsCollection,
  announcements: announcementCollection,
  contributors: contributorCollection
};
