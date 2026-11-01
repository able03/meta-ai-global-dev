import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from './parser.js'
import { toPython } from './python.js'

const py = (source: string) => toPython(parse(source).program!)
const code = (source: string) => py(source).map((l) => l.text).join('\n')
const example = (name: string) => readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8')

describe('python', () => {
  it('turns a text program into plain Python', () => {
    const out = code(example('guess-the-number.say'))
    expect(out).toContain('import random')
    expect(out).toContain('secret = random.randint(1, 10)')
    expect(out).toContain('guess = int(input("Your guess? "))')
    expect(out).toContain('if guess == secret:')
    expect(out).toContain('elif guess < secret:')
    expect(out).toContain('else:')
    expect(out).not.toContain('pgzrun')
  })

  it('turns a game into Pygame Zero', () => {
    const out = code(example('catch-the-stars.say'))
    expect(out).toContain('import pgzrun')
    expect(out).toContain('stars = []')
    expect(out).toContain('basket = Actor("basket", (WIDTH // 2, HEIGHT - 30))')
    expect(out).toContain('star.vx, star.vy = 0, 3')
    expect(out).toContain('if keyboard.left:')
    expect(out).toContain('basket.x -= 10')
    expect(out).toContain('for star in stars[:]:')
    expect(out).toContain('if basket.colliderect(star):')
    expect(out).toContain('stars.remove(star)')
    expect(out).toContain('print(f"Score: {score}")')
    expect(out).toContain('global score')
    expect(out).toContain('clock.schedule_interval(every_1_second, 1)')
    expect(out.trim().endsWith('pgzrun.go()')).toBe(true)
  })

  it('bounces with velocity flips', () => {
    const out = code(example('bouncing-ball.say'))
    expect(out).toContain('ball.vx, ball.vy = 5, 5')
    expect(out).toContain('ball.vx = -ball.vx')
  })

  it('links every Python line back to its Step', () => {
    const lines = py(example('catch-the-stars.say'))
    const fromLine12 = lines.filter((l) => l.src === 12).map((l) => l.text.trim())
    expect(fromLine12).toContain('if basket.colliderect(star):')
    expect(lines.every((l) => l.text === '' || l.explain.length > 0)).toBe(true)
  })
})
