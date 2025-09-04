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
