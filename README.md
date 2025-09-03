# Hyperledger Fabric – User Registration & Authentication (with Fabric CA)

This guide walks you through:
1) bringing up a local Fabric test network with CA,
2) registering & enrolling a user via Fabric CA,
3) storing credentials in a wallet, and
4) authenticating via a Node.js app by querying the ledger.

Tested with `fabric-samples/test-network`, Org1, channel `mychannel`, chaincode `basic` (asset-transfer-basic).

---

## 0) Prerequisites

- Docker & Docker Compose
- Node.js 16+ (LTS recommended)
- Git & cURL
- Hyperledger Fabric samples + binaries

> If you haven’t yet:
```bash
# Get samples + binaries (downloads fabric-samples/, bin/, config/)
curl -sSL https://bit.ly/2ysbOFE | bash -s
cd fabric-samples

## Setting up Hyperledger Fabric Test Network

First, move into the `test-network` directory:

```bash
cd fabric-samples/test-network

## Make Fabric binaries available (peer, fabric-ca-client, etc.)

```bash
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/

# Clean up any old network
