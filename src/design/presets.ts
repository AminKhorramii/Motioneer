/**
 * The looks offered at setup. Design knowledge, not machinery: edit freely, add a look,
 * delete one. Everything here is data the rest of the app reads.
 */

import type { Taste } from '@/taste'
import { FACES } from '@/design/faces'

/**
 * The looks offered at setup. They are named for the feeling rather than the technique,
 * because someone choosing a look is picking a mood, not a type stack, and each one is shown
 * as a real rendered page rather than described.
 */
export const PRESETS: Taste[] = [
  {
    name: 'anime',
    bg: '#fdf2f8', ink: '#1a1024', dim: '#7c6a8c', accent: '#ff4d8d', accent2: '#38d0ff',
    display: FACES.grotesk, body: FACES.sans, scale: 1.38, radius: 20, density: 0.45, weight: 800, caps: false, motion: 'lively',
  },
  {
    name: 'spaceship',
    bg: '#05070f', ink: '#dbe7ff', dim: '#6a7a9c', accent: '#4dd8ff', accent2: '#8b7bff',
    display: FACES.mono, body: FACES.sans, scale: 1.3, radius: 2, density: 0.7, weight: 600, caps: true, motion: 'soft',
  },
  {
    name: 'neon',
    bg: '#0a0510', ink: '#f4e9ff', dim: '#8a76a0', accent: '#ff2fd0', accent2: '#7cf7ff',
    display: FACES.grotesk, body: FACES.sans, scale: 1.44, radius: 0, density: 0.6, weight: 800, caps: false, motion: 'lively',
  },
  {
    name: 'gallery',
    bg: '#fbfaf8', ink: '#0d0d0c', dim: '#77746e', accent: '#0d0d0c', accent2: '#9a8f7a',
    display: FACES.serif, body: FACES.serif, scale: 1.5, radius: 0, density: 0.32, weight: 400, caps: true, motion: 'still',
  },
  {
    name: 'quiet dark',
    bg: '#0c0d10', ink: '#e9ecf1', dim: '#8a93a0', accent: '#6ea8fe', accent2: '#b48cff',
    display: FACES.sans, body: FACES.sans, scale: 1.28, radius: 10, density: 0.55, weight: 600, caps: false, motion: 'soft',
  },
  {
    name: 'paper editorial',
    bg: '#f6f2ea', ink: '#1b1a17', dim: '#6d675d', accent: '#b4472a', accent2: '#2f5d50',
    display: FACES.serif, body: FACES.serif, scale: 1.42, radius: 2, density: 0.4, weight: 500, caps: true, motion: 'still',
  },
  {
    name: 'terminal',
    bg: '#07080a', ink: '#d7ffe6', dim: '#5f8a72', accent: '#38e08a', accent2: '#e0c838',
    display: FACES.mono, body: FACES.mono, scale: 1.22, radius: 0, density: 0.75, weight: 500, caps: true, motion: 'lively',
  },
  {
    name: 'warm studio',
    bg: '#191512', ink: '#f2e9dd', dim: '#a2917f', accent: '#e0a441', accent2: '#7fb8a0',
    display: FACES.serif, body: FACES.sans, scale: 1.36, radius: 14, density: 0.5, weight: 500, caps: false, motion: 'soft',
  },
]
