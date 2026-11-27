# TeachMe

TeachMe is a personal app for learning and for job applications. It runs on your own computer and keeps your data there.

- **Teach Me**: learning journeys built from your documents, with lessons, questions and quizzes.
- **CV Studio**: build a master CV, tailor it to a job ad with evidence-checked AI suggestions, check it, and write cover letters.
- **Applications**: track where you applied, what you sent, and your screening answers.
- **Interview**: mock interview questions and answer practice.

## What you need

- [Node.js](https://nodejs.org) 20.9 or newer (Node 24 LTS recommended). It includes `npm`.
- [Git](https://git-scm.com).
- An AI provider for the AI features: an OpenAI or Anthropic API key, or Ollama (cloud or running on your computer). You add it inside the app.

## Set up on a new computer

Run these in a terminal (on Windows: PowerShell, Command Prompt or Git Bash).

1. Get the code:

   ```bash
   git clone https://github.com/oleevaqween/teachme-app.git
   cd teachme-app
   ```

2. Install everything. This also prepares the database code automatically:

   ```bash
   npm install
   ```

   Newer versions of npm may print an "allow-scripts" warning listing a few packages. It is safe to ignore.

3. Optional settings: copy the template and fill in only what you need (every setting is optional; the file explains each one):

   ```bash
   cp .env.example .env.local
   ```

   On Windows Command Prompt use `copy .env.example .env.local` instead.

4. Create the app database (`dev.db` in the project folder):

   ```bash
   npm run db:setup
   ```

   The career database for CV Studio and Applications (`.data/career.db`) is created automatically the first time you open CV Studio.

5. Start TeachMe:

   ```bash
   npm run dev
   ```

   Then open http://localhost:3000. On Windows you can instead double-click `start-dev.bat`, which starts the app and opens the browser.

6. In the app, open **Settings** and add your AI provider.

### If you see certificate errors

On some networks (for example with a company proxy) the AI calls fail with certificate errors. Start the app with your computer's certificates trusted:

```bash
# macOS / Linux / Git Bash
NODE_OPTIONS=--use-system-ca npm run dev
```

On Windows, `start-dev.bat` already does this.

## Moving your data to another computer

Your data is not in Git, on purpose. To move it:

- **CVs, applications and interview practice**: on the old computer, open **Settings** and use **Back up your career data** to download a backup file. On the new computer, open **Settings** and use **Restore from a backup** with that file. Restore only adds what is missing; it never overwrites.
- **AI settings and Teach Me journeys** live in `dev.db`. Either add your AI provider again in **Settings**, or copy `dev.db` from the old project folder into the new one *before* you start the app there (skip step 4 if you copy it).
- **Uploaded documents** for Teach Me are in the `uploads` folder; copy it across if you want them.

## Updating

```bash
git pull
npm install
npm run db:setup
```

`npm run db:setup` only applies new database changes and keeps your data.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start TeachMe for everyday use |
| `npm run db:setup` | Create or update the app database |
| `npm test` | Run the tests |
| `npm run build` | Check that the app builds |

Built with Next.js, React, Prisma and SQLite.

## Licence

MIT. See [LICENSE](LICENSE).
