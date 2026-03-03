# voting-app

> Decentralised on-chain voting built on Solana — no servers, no middlemen, every vote is a real blockchain transaction.

Unlike traditional voting systems that rely on centralised databases, voting-app stores every candidate, voter, and ballot directly on the Solana blockchain. Tamper-proof by design. Anyone can verify every vote in real time on-chain.

---

## Quick Start

```bash
# 1. Create folders and files
cd ~ && \
mkdir -p voting-app/anchor-program/programs/vote_app/src \
         voting-app/anchor-program/tests \
         voting-app/anchor-program/target/idl \
         voting-app/frontend/css \
         voting-app/frontend/js

# 2. Fill all files at once
bash ~/voting-app/fill-files.sh

# 3. Run the frontend
cd ~/voting-app/frontend
npx serve .
```

Open → **http://localhost:3000**
Connect Phantom (Devnet) → done.

---

## Program

```
ID:      ArJc7rF9ygzDCeUxu3Vf4QKbHfixs6rvUAZcHtQ3wiWd
Network: Solana Devnet
```

---

## Resources

- [Solana Explorer](https://explorer.solana.com/address/ArJc7rF9ygzDCeUxu3Vf4QKbHfixs6rvUAZcHtQ3wiWd?cluster=devnet) — view the live program
- [Phantom Wallet](https://phantom.app) — browser wallet
- [Anchor Docs](https://www.anchor-lang.com) — smart contract framework
- [Devnet Faucet](https://faucet.solana.com) — get free SOL for testing
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js) — JS SDK used in the frontend

---

## What Makes It Different

- **Fully on-chain** — no backend, no database, no single point of failure
- **Permissionless** — anyone with a Solana wallet can register and vote
- **Transparent** — every transaction publicly verifiable on-chain
- **PDA-enforced integrity** — one vote per wallet, enforced at the program level, not the app level
- **No framework** — frontend runs as plain HTML/CSS/JS, zero build tools needed

---

Developed by **devWisZ**