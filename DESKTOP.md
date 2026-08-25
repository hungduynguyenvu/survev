Note: this project was created with the help of generative AI.

# Survev Desktop Client

This repository contains an unofficial standalone desktop client for [Survev](https://github.com/survev/survev), built with Electron.

The goal of the desktop client is to provide a portable version of Survev that runs using locally stored frontend files while remaining compatible with the official Survev API, accounts, and multiplayer servers.

> [!IMPORTANT]
> This is an unofficial modification of Survev. It is not an official Survev desktop application and is not endorsed by the Survev project maintainers.

---

## Features

The desktop client currently supports:

- Portable Windows desktop application.
- Local frontend files and game assets.
- Official Survev multiplayer servers.
- Official Survev API.
- Anonymous play.
- Google/Discord account authentication supported by Survev.
- Persistent login sessions between launches.
- Account profile and XP/pass functionality.
- Player statistics and leaderboard pages.
- Non-advertising client SDK.
- External client files that can be inspected or modified without unpacking the Electron executable.
- Fullscreen desktop launch.
- No Node.js, pnpm, Git, or development environment required on the computer running the packaged application.

---

# Architecture

The desktop application consists of two major parts:

```text
Survev Desktop
│
├── Electron launcher
│   └── desktop/main.cjs
│
└── Local Survev client
    └── client/dist/
```

During development, Electron starts a small local HTTP server:

```text
http://127.0.0.1:3000
```

The local Survev frontend is served from `client/dist`.

Normal API requests are forwarded by the Electron main process to:

```text
https://api.survev.io
```

After matchmaking, the game client connects directly to the official regional game servers.

The actual realtime game connection is therefore not routed through the local HTTP API proxy.

A simplified flow is:

```text
Local Survev client
        │
        ├── static files
        │      └── local client/dist
        │
        ├── API requests
        │      └── local Electron proxy
        │             └── api.survev.io
        │
        └── game connection
               └── official regional game server
```

---

# Account Authentication

The official Survev authentication flow normally expects the frontend to run on the official Survev website.

Because the desktop client runs locally, Electron handles the final authentication transition and transfers the authenticated Survev session into the local desktop session.

This allows the local client to retain:

- account login;
- profile information;
- XP/pass data;
- authenticated API access;
- persistent login across application restarts.

Authentication tokens and session cookie values must never be printed, committed, or published.

---

# Requirements for Development

To build the desktop client from source, install the normal Survev development requirements, including:

- Node.js;
- pnpm;
- Git;
- Survev repository dependencies.

Install dependencies from the repository root:

```bash
pnpm install
```

Electron and Electron Builder are development dependencies of this fork.

---

# Local Configuration

The real local Survev configuration file is:

```text
survev-config.hjson
```

This file may contain local or private configuration and is intentionally excluded from Git.

Do **not** commit:

```text
survev-config.hjson
.env
```

or any file containing:

- OAuth secrets;
- API keys;
- session cookies;
- access tokens;
- private keys;
- passwords;
- other credentials.

A safe example configuration may be stored separately in the repository without private values.

The desktop client uses a localhost proxy definition similar to:

```hjson
proxies: {
    "127.0.0.1": {
        google: true
        discord: true
    }
}
```

The official regional server configuration should match the current Survev configuration required by the official servers.

---

# Advertising SDK

The desktop build intentionally uses Survev's non-advertising SDK implementation.

In:

```text
client/vite.config.mts
```

the SDK alias is configured to use:

```ts
alias: {
    "@/sdk.ts": "./sdk-manager",
},
```

instead of selecting the production advertising SDK.

This modification should be checked after merging future upstream Survev updates, particularly if the Vite configuration or SDK structure changes.

---

# Running the Desktop Client During Development

First build the client when necessary:

```bash
pnpm --dir client build
```

Then launch Electron:

```bash
pnpm desktop
```

The Electron application serves the contents of:

```text
client/dist/
```

locally and opens the desktop game client.

No separate Survev API or game server should be required when the goal is to connect to the official Survev servers.

---

# Building the Portable Windows Version

From the repository root, run:

```bash
pnpm desktop:pack
```

This first builds the client and then packages the Electron application.

The output is created under:

```text
desktop-release/win-unpacked/
```

A typical packaged directory looks similar to:

```text
win-unpacked/
│
├── Survev.exe
│
├── client/
│   ├── index.html
│   ├── assets/
│   ├── audio/
│   ├── css/
│   ├── fonts/
│   ├── img/
│   ├── js/
│   ├── l10n/
│   ├── stats/
│   └── ...
│
├── resources/
│   └── app.asar
│
├── locales/
├── *.dll
└── other Electron runtime files
```

The entire directory is the application.

`Survev.exe` cannot normally be copied and used by itself because it depends on the Electron runtime files located beside it.

---

# Portability

The `win-unpacked` directory is designed to be portable.

For example:

```text
D:\Games\Survev Desktop\
├── Survev.exe
├── client/
├── resources/
├── locales/
└── ...
```

The whole directory can be moved to another location and launched without the original source repository.

The computer running the packaged application does not need:

- Node.js;
- pnpm;
- Git;
- Vite;
- Electron development packages.

---

# Editable Client Files

The built Survev client is intentionally copied outside `app.asar`.

The Electron launcher is packaged inside:

```text
resources/app.asar
```

while the frontend is kept in:

```text
client/
```

beside the executable.

This makes many client resources directly accessible for modification and experimentation.

However, not every original source asset remains an individual editable file after the Vite build.

Survev's build process may:

- bundle JavaScript;
- generate hashed files;
- combine textures into atlases;
- convert images to generated formats;
- compile definitions into JavaScript.

For deeper modding, modifying the original source and rebuilding the client may therefore still be necessary.

---

# Packaging Output

Generated desktop builds should not be committed to the source repository.

The repository `.gitignore` should contain:

```gitignore
# Electron desktop build output
desktop-release/
```

Generated files such as these should remain outside normal Git history:

```text
desktop-release/
client/dist/
node_modules/
```

Source code and build configuration should be committed instead.

---

# Creating a ZIP Release

The safest way to create a portable release archive is to first build and test:

```text
desktop-release/win-unpacked/
```

Then archive that known-good directory.

For example, from Git Bash:

```bash
cd desktop-release
tar -a -c -f Survev-Desktop.zip win-unpacked
```

The resulting ZIP contains the complete portable application.

For public distribution, release archives are better uploaded through GitHub Releases rather than committed directly into the Git repository.

---

# Updating for New Survev Versions

The desktop client must remain compatible with the version used by the official Survev servers.

Compatibility may depend on more than the version number. Upstream updates can modify:

- packet formats;
- network protocol behavior;
- API routes;
- game object definitions;
- maps;
- game modes;
- matchmaking behavior;
- assets;
- client logic;
- account systems.

Changing only the version number is therefore not sufficient to make an old client compatible with a newer server.

The recommended Git structure is:

```text
survev/survev
official upstream repository
        │
        ▼
your fork: master
clean/up-to-date upstream base
        │
        ▼
your fork: desktop-client
desktop-specific modifications
```

Day-to-day desktop development should occur on:

```text
desktop-client
```

The `master` branch should remain close to the official Survev repository.

---

# Updating from Upstream

Before updating:

1. Commit all current desktop changes.
2. Push them to GitHub.
3. Keep a known-good packaged version as a backup.

Then update the fork's `master` branch from the official Survev repository.

After the local `master` branch contains the latest upstream changes, merge/update `master` into:

```text
desktop-client
```

Resolve any conflicts and rebuild.

Files especially likely to require attention include:

```text
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
client/vite.config.mts
```

The custom:

```text
desktop/main.cjs
```

is less likely to conflict because it does not normally exist upstream.

After an upstream update, test at minimum:

- application startup;
- anonymous matchmaking;
- official multiplayer;
- account login;
- persistent login;
- account profile;
- XP/pass;
- player statistics;
- leaderboard;
- absence of advertising;
- packaging.

Then build a new portable release with:

```bash
pnpm desktop:pack
```

---

# Git Workflow

The recommended development branch is:

```text
desktop-client
```

A normal change should follow this sequence:

```text
edit
  ↓
test
  ↓
review Git changes
  ↓
commit
  ↓
push to GitHub
```

Use clear commit messages, for example:

```text
Add standalone Electron desktop client
Add custom desktop icon
Fix desktop authentication bridge
Update desktop client for Survev 0.3.14
Add mod asset override system
```

Avoid committing unfinished generated files or private configuration.

For risky experiments, create a feature branch from `desktop-client`, for example:

```text
feature/mod-loader
```

The known-working `desktop-client` branch can then remain untouched until the experiment works.

---

# Recommended Files to Commit

Desktop-specific source changes normally include:

```text
desktop/main.cjs
client/vite.config.mts
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
.gitignore
DESKTOP.md
README.md
```

Safe example configuration files may also be committed.

Do not commit:

```text
survev-config.hjson
.env
node_modules/
client/dist/
desktop-release/
```

Never commit credentials or authenticated session information.

---

# Known-Good Releases

Before making major architectural changes, keep a known-good desktop build or Git branch/tag.

For example:

```text
stable-desktop-0.3.13
```

or a Git tag/release corresponding to a tested Survev version.

This makes it easy to return to a working client if later development breaks compatibility.

---

# License and Attribution

This desktop client is a modified version of the open-source Survev project.

Original project:

https://github.com/survev/survev

Survev is distributed under the GPL-3.0-or-later license.

This fork retains the upstream license and must follow its requirements when modified versions are distributed.

This desktop client is unofficial and should not be presented as an official Survev application.