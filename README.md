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

```

## 1) Setting up Hyperledger Fabric Test Network

```bash
# First, move into the `test-network` directory:


cd fabric-samples/test-network

# Make Fabric binaries available (peer, fabric-ca-client, etc.)
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/

# Clean up any old network
./network.sh down

# Bring up network with CAs and create channel 'mychannel'
./network.sh up createChannel -c mychannel -ca

```

# You have now

- Orderer + Org1 + Org2 peers
- Fabric CA for each org
- Channel mychannel

## 2) Deploy Sample Chaincode (asset-transfer-basic)

```bash
./network.sh deployCC \
  -c mychannel \
  -ccn basic \
  -ccp ../asset-transfer-basic/chaincode-javascript/ \
  -ccl javascript
```

### Verify deployment (Set org1)

```bash
# Set Org1 peer CLI env
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode querycommitted --channelID mychannel --name basic
# Expect: committed definition for 'basic'
```

## 3) Work with Fabric CA (Org1)

We will enroll the CA admin, then register and enroll a normal user user1.

> All commands below are run from fabric-samples/test-network.

### 3.1 Enroll CA Admin (Org1)

```bash
# Point the CA client to Org1’s CA artifacts
export FABRIC_CA_CLIENT_HOME=${PWD}/organizations/peerOrganizations/org1.example.com/

# Enroll CA admin (TLS is enabled → use https + CA tls-cert)
fabric-ca-client enroll \
  -u https://admin:adminpw@localhost:7054 \
  --caname ca-org1 \
  --tls.certfiles ${PWD}/organizations/fabric-ca/org1/tls-cert.pem
```
This creates Org1 admin MSP under:
```bash
organizations/peerOrganizations/org1.example.com/msp
```

### 3.2) Register a New User (user1)

```bash
fabric-ca-client register \
  --caname ca-org1 \
  --id.name user1 \
  --id.secret user1pw \
  --id.type admin \
  --id.affiliation org1.department1 \
  -u https://localhost:7054 \
  --tls.certfiles ${PWD}/organizations/fabric-ca/org1/tls-cert.pem
```

### 3.3) Enroll the User (user1)

```bash
fabric-ca-client enroll \
  -u https://user1:user1pw@localhost:7054 \
  --caname ca-org1 \
  -M ${PWD}/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp \
  --tls.certfiles ${PWD}/organizations/fabric-ca/org1/tls-cert.pem
```

This generates user1 credentials:
```bash
organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/
├─ cacerts/
├─ keystore/          # private key
├─ signcerts/         # x509 certificate
├─ IssuerPublicKey
└─ IssuerRevocationPublicKey
```

## 4) Node.js App – Wallet, Gateway & Authentication

We’ll create a small Node.js app that:

- loads user1 cert/key from MSP,
- imports it into a FileSystem wallet,
- connects to the gateway using user1,
- proves authentication by reading/creating/querying assets.

### 4.1) Create the App

```bash
# still under fabric-samples/test-network
mkdir fabric-auth-app
cd fabric-auth-app
npm init -y
npm install fabric-network
```

### 4.2) app.js

```js
const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        // Load connection profile for Org1
        const ccpPath = path.resolve(__dirname, '..', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Create a new wallet
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check if user1 is already in wallet
        const identity = await wallet.get('adminuser1');
        if (!identity) {
            console.log('adminuser1 not found in wallet, importing...');

            const credPath = path.resolve(__dirname, '..', 'organizations', 'peerOrganizations', 'org1.example.com', 'users', 'AdminUser1@org1.example.com', 'msp');
            const cert = fs.readFileSync(path.join(credPath, 'signcerts', 'cert.pem')).toString();
            const key = fs.readFileSync(path.join(credPath, 'keystore', fs.readdirSync(path.join(credPath, 'keystore'))[0])).toString();

            const x509Identity = {
                credentials: {
                    certificate: cert,
                    privateKey: key,
                },
                mspId: 'Org1MSP',
                type: 'X.509',
            };
            await wallet.put('adminuser1', x509Identity);
            console.log('Successfully imported adminuser1 into wallet');
        }

        // Connect without discovery
        const gateway = new Gateway();
        // await gateway.connect(ccp, {
        //   wallet,
        //   identity: 'user1',
        //   discovery: { enabled: false }
        // });
        await gateway.connect(ccp, {
            wallet,
            identity: 'adminuser1',
            discovery: { enabled: true, asLocalhost: true }
        });

        // Get network and contract
        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('basic');

        // Step 1: Try to read asset1
        try {
            const result = await contract.evaluateTransaction('ReadAsset', 'asset1');
            console.log(`Read asset1: ${result.toString()}`);
        } catch (err) {
            console.log('asset1 not found, creating it now...');

            // Step 2: Create asset1
            await contract.submitTransaction('CreateAsset', 'asset1', 'blue', '5', 'Tomoko', '300');
            console.log('asset1 created successfully');

            // Step 3: Read asset1 again
            const result = await contract.evaluateTransaction('ReadAsset', 'asset1');
            console.log(`Read asset1 after creation: ${result.toString()}`);
        }

        await contract.submitTransaction('UpdateAsset', 'asset1', 'red', '10', 'Keshav', '500');
        const result = await contract.evaluateTransaction('ReadAsset', 'asset1');
        console.log("new tx result" + result.toString());
        const all = await contract.evaluateTransaction('GetAllAssets');
        console.log("list all assets" + all.toString());
        await gateway.disconnect();


    } catch (error) {
        console.error(`Error: ${error}`);
        process.exit(1);
    }
}

main();
```

### 4.3 Run

```bash
node app.js
```

Expected output (example):

```bash
Wallet path: .../wallet
User1 not found in wallet, importing...
Successfully imported user1 into wallet
asset1 not found, creating it now...
asset1 created successfully
Read asset1 after creation: {"AppraisedValue":300,"Color":"blue","ID":"asset1","Owner":"Tomoko","Size":5}
new tx result{"AppraisedValue":"500","Color":"red","ID":"asset1","Owner":"Keshav","Size":"10"}
list all assets[{"AppraisedValue":"500","Color":"red","ID":"asset1","Owner":"Keshav","Size":"10"}]
```

## 5) Let’s build a simple login/register API with Hyperledger Fabric CA + Express.js.

### 4.1) Install Fabric CA Client SDK

```bash
npm install fabric-ca-client fabric-network

```

index.js

```js
const express = require('express');
const bodyParser = require('body-parser');
const { Wallets, Gateway } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

// Path to Org1 connection profile
const ccpPath = path.resolve(__dirname, '..', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

// Wallet for storing identities
const walletPath = path.join(process.cwd(), 'wallet');

async function getWallet() {
  return await Wallets.newFileSystemWallet(walletPath);
}


app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
    const ca = new FabricCAServices(caURL);

    const wallet = await getWallet();

    // Check if user already exists
    const userExists = await wallet.get(username);
    if (userExists) {
      return res.status(400).json({ error: `User ${username} already exists in wallet` });
    }

    // Admin identity is needed to register new users
    const adminIdentity = await wallet.get('admin');
    if (!adminIdentity) {
      return res.status(500).json({ error: 'Admin identity not found in wallet. Enroll admin first.' });
    }

    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    // Register user with CA
    await ca.register({
      affiliation: 'org1.department1',
      enrollmentID: username,
      enrollmentSecret: password,
      role: 'client'
    }, adminUser);

    // Enroll user and add to wallet
    const enrollment = await ca.enroll({ enrollmentID: username, enrollmentSecret: password });
    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: 'Org1MSP',
      type: 'X.509',
    };
    await wallet.put(username, x509Identity);

    res.json({ message: `Successfully registered and enrolled user ${username}` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.post('/login', async (req, res) => {
  try {
    const { username } = req.body;

    const wallet = await getWallet();

    const identity = await wallet.get(username);
    if (!identity) {
      return res.status(401).json({ error: 'User identity not found. Please register first.' });
    }

    // (For simplicity, we just check presence in wallet)
    // In production: tie to JWT/session
    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: username,
      discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork('mychannel');
    const contract = network.getContract('basic');

    // Example: Fetch all assets
    const result = await contract.evaluateTransaction('GetAllAssets');
    await gateway.disconnect();

    res.json({ message: `Login successful for ${username}`, assets: JSON.parse(result.toString()) });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.listen(3000, () => {
  console.log('🚀 Fabric Auth API running on http://localhost:3000');
});
```
