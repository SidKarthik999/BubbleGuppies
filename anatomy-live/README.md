# Anatomy Live

Turn a short prompt into a live 2D illustration. Built-in anatomy and technical diagrams render locally. Other prompts stream drawing commands from Claude through OpenRouter.

```sh
cp .env.example .env
# For generated sketches, add your OpenRouter API key to .env.
node --env-file=.env dev.mjs
```

Open [localhost:4173](http://127.0.0.1:4173). Use Node.js 22 or newer. There are no npm dependencies to install.

Try **hand anatomy**, **jellyfish**, or **two external gears with 12 and 36 teeth**. See [documentation.md](documentation.md) for setup on Windows, the drawing protocol, and how to add illustrations.

Released under the [MIT License](LICENSE).
