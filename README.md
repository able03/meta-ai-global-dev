# Sayntax

> **Just say it.** A programming language you can speak, with Meta AI as its front door.

First-time coders quit at the syntax wall. Sayntax lets beginners write logic in their own words,
see it as short tidy **Steps** (real `.say` source code), run it instantly in the browser, and learn
real Python along the way.

🚧 Built for the Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026). Work in progress.

## Quick start

```bash
npm install
npm run dev     # app at http://localhost:5173
npm test        # parser + interpreter tests
```

## Example (`examples/catch-the-stars.say`)

```say
basket is a 🧺 at bottom center, size 60
⭐ falls 3
score is 0

every 1 second:
    make a ⭐ at random x, top

when left key is pressed: move basket left 10
when right key is pressed: move basket right 10

when basket touches ⭐:
    add 1 to score
    remove that ⭐
    say "Score: {score}"
```

## License

MIT

## Scribble, the mascot

Scribble sits on the game console and reacts as you build: waves hello, scratches its head while
Meta AI tidies your words, cheers when your game runs, and shrugs when a line needs fixing.

Made with [Meshy](https://www.meshy.ai): concept image → image-to-3D → auto-rig → five animations
(Idle, Big Wave Hello, Confused Scratch, Cheer, Shrug), compressed from 5.2 MB to 684 KB with
`gltf-transform` (Draco + WebP), and shown with Google's `<model-viewer>`, loaded lazily after the page.
