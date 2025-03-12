# @elizaos/plugin-kadena

Kadena plugin for Eliza OS. This plugin enables kadena blockchain functionality for your Eliza agent.

## Features

- Send KADENA tokens
- Check wallet balances
- SWAP tokens in dex

### check balance

prompt: check my kda balance



prompt: check free.cyberfly_token balance


### transfer KDA


prompt: send 1 kda to k:walletaddress from chain 1


### transfer crosschain


prompt: send 1 kda to k:walletaddress from chain 1 to chain 2


### swap 


prompt: swap 1 kda to free.cyberfly_token on kdswap



prompt: swap 1 kda to free.cyberfly_token on mercatus


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


