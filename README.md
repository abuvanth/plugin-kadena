# @elizaos/plugin-kadena

Kadena plugin for Eliza OS. This plugin enables kadena blockchain functionality for your Eliza agent.

## Features

- Send KADENA tokens
- Check wallet balances
- SWAP tokens in dex

## Installation

```bash
pnpm add @elizaos/plugin-kadena
```

## Instructions

1. First, ensure you have a kadena wallet and private key.

2. Add the kadena plugin to your character's configuration:

```json
{
"name": "kadena Agent",
"plugins": ["@elizaos/plugin-kadena"],
"settings": {
"secrets": {
"KADENA_SECRET_KEY": "your_secret_key_here",
"KADENA_NETWORK": "mainnet01"
}
}
}
```

Set up your environment variables in the `.env` file:

```bash
KADENA_SECRET_KEY=your_secret_key_here
KADENA_NETWORK=mainnet01
```


