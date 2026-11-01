import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from '../lang/parser.js'
import { Engine } from './engine.js'

function run(source: string, random = () => 0.5) {
  const { program, errors } = parse(source)
  expect(errors).toEqual([])
  const said: string[] = []
  const asked: string[] = []
  const errs: string[] = []
  const engine = new Engine(
    program!,
    { say: (t) => said.push(t), ask: (p) => asked.push(p), error: (e) => errs.push(e.message), stopped: () => {} },
    random,
  )
  engine.start()
  return { engine, said, asked, errs, frames: (n: number) => Array.from({ length: n }, () => engine.step()) }
}

const example = (name: string) => readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8')

describe('engine', () => {
  it('bounces a ball off the walls', () => {
    const { engine, frames } = run(example('bouncing-ball.say'))
    const ball = engine.things[0]
    expect(ball.vx).toBe(5)
    frames(200)
    expect(ball.x).toBeGreaterThanOrEqual(20)
    expect(ball.x).toBeLessThanOrEqual(780)
    expect(ball.y).toBeLessThanOrEqual(480)
  })

  it('plays guess the number', () => {
    const { engine, said, asked } = run(example('guess-the-number.say')) // secret = 6 with random 0.5
    expect(asked).toEqual(['Your guess?'])
    engine.answer('3')
    expect(said).toContain('Higher!')
    engine.step()
    engine.answer('9')
    expect(said).toContain('Lower!')
    engine.step()
    engine.answer('6')
    expect(said).toContain('You got it! 🎉')
    expect(engine.running).toBe(false)
  })

  it('catches falling stars and keeps score', () => {
    const { engine, said, frames } = run(example('catch-the-stars.say'))
    // random 0.5 puts each star right above the basket in the middle
    frames(60 * 4)
    expect(said.some((s) => s.startsWith('Score: '))).toBe(true)
    expect(engine.vars.get('score')).toBeGreaterThan(0)
  })

  it('moves with held keys', () => {
    const { engine, frames } = run('basket is a 🧺 at bottom center\nwhen left key is pressed: move basket left 10')
    const startX = engine.things[0].x
    engine.keyDown('left')
    frames(30)
    engine.keyUp('left')
    expect(engine.things[0].x).toBeLessThan(startX)
  })

  it('repeats and waits', () => {
    const { said, frames } = run('repeat 3 times:\n    say "hi"\n    wait 0.1 second')
    frames(60)
    expect(said).toEqual(['hi', 'hi', 'hi'])
  })

  it('reports a friendly runtime error with the line', () => {
    const { errs, engine } = run('name is "Bob"\nadd 1 to name')
    expect(errs[0]).toContain('needs to be a number')
    expect(engine.running).toBe(false)
  })
})
