// Tests for the world-building steps that make RPGs and adventures possible.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from '../lang/parser.js'
import { Engine } from './engine.js'

function run(source: string, random = () => 0.5) {
  const { program, errors } = parse(source)
  expect(errors).toEqual([])
  const said: string[] = []
  const sounds: string[] = []
  const engine = new Engine(
    program!,
    { say: (t) => said.push(t), ask: () => {}, error: (e) => said.push(`ERROR ${e.message}`), stopped: () => {}, sound: (n) => sounds.push(n) },
    random,
  )
  engine.start()
  return { engine, said, sounds, frames: (n: number) => Array.from({ length: n }, () => engine.step()) }
}

describe('parsing world steps', () => {
  it('reads every new kind of step', () => {
    const { program, errors } = parse(
      [
        'background is green',
        'hero is a 🧙',
        '🧱 is solid',
        '👾 chases hero 2',
        '🐶 follows hero',
        '👾 moves toward hero at speed 1.5',
        'show "❤️ {hearts}" at top left',
        'hearts is 3',
        'hero says "Hi!"',
        'hero becomes 🐉',
        'hero turns red',
        'hero grows 10',
        'hero shrinks',
        'remove all 👾',
        'play coin sound',
        'when a key is pressed: move hero left 5',
        'when d key is pressed: move hero right 5',
      ].join('\n'),
    )
    expect(errors).toEqual([])
    const kinds = program!.body.map((s) => s.k)
    expect(kinds).toEqual([
      'background', 'thing', 'solid', 'chase', 'chase', 'chase', 'label', 'set', 'speak', 'become', 'become',
      'grow', 'grow', 'remove', 'sound', 'whenKey', 'whenKey',
    ])
    expect(program!.body[15]).toMatchObject({ k: 'whenKey', key: 'a' })
  })

  it('still treats "make a key" as an item, not the A key', () => {
    const { program, errors } = parse('key is a 🔑\nmake a key at center')
    expect(errors).toEqual([])
    expect(program!.body[1]).toMatchObject({ k: 'make', name: 'key' })
  })

  it('suggests the right sound name', () => {
    const { errors } = parse('play con sound')
    expect(errors[0].message).toContain('did you mean "coin"')
  })

  it('parses the tiny adventure example', () => {
    const src = readFileSync(new URL('../../examples/tiny-adventure.say', import.meta.url), 'utf8')
    expect(parse(src).errors).toEqual([])
  })
})

describe('running world steps', () => {
  it('stops characters at solid walls', () => {
    const { engine, frames } = run('hero is a 🧙 at 100, 250\n🧱 is solid\nmake a 🧱 at 200, 250\nhero moves right 5')
    frames(60)
    const hero = engine.things.find((t) => t.kind === 'hero')!
    expect(hero.x).toBeLessThan(200 - 30)
  })

  it('makes chasers move toward their target', () => {
    const { engine, frames } = run('hero is a 🧙 at left\n👾 chases hero 2\nmake a 👾 at right')
    const monster = engine.things.find((t) => t.kind === '👾')!
    const startX = monster.x
    frames(30)
    expect(monster.x).toBeLessThan(startX - 40)
  })

  it('shows live on-screen text with variables', () => {
    const { engine } = run('hearts is 3\nshow "❤️ {hearts}" at top left\nsubtract 1 from hearts')
    expect(engine.labelTexts()).toEqual([{ text: '❤️ 2', x: 14, y: 28, align: 'left' }])
  })

  it('puts speech bubbles over characters, then clears them', () => {
    const { engine, said, frames } = run('hero is a 🧙\nhero says "Hello!"')
    expect(engine.things[0].bubble?.text).toBe('Hello!')
    expect(said).toContain('Hello!')
    frames(200)
    expect(engine.things[0].bubble).toBeNull()
  })

  it('transforms and grows characters, and changes the background', () => {
    const { engine } = run('background is green\nhero is a 🧙, size 40\nhero becomes 🐉\nhero grows 20')
    expect(engine.things[0]).toMatchObject({ emoji: '🐉', size: 60 })
    expect(engine.background.color).toBe('#22c55e')
  })

  it('plays sound effects', () => {
    const { sounds } = run('play coin sound\nplay win sound')
    expect(sounds).toEqual(['coin', 'win'])
  })

  it('plays the tiny adventure: picking up a gem scores and plays a coin sound', () => {
    const src = readFileSync(new URL('../../examples/tiny-adventure.say', import.meta.url), 'utf8')
    let n = 0
    const { engine, sounds, frames } = run(src, () => (n++ * 0.37) % 1) // gems land in different spots
    frames(5)
    const hero = engine.things.find((t) => t.kind === 'hero')!
    const gem = engine.things.find((t) => t.kind === '💎')!
    hero.x = gem.x
    hero.y = gem.y
    frames(3)
    expect(engine.vars.get('gems')).toBe(1)
    expect(sounds).toContain('coin')
  })
})
