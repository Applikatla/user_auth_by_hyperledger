// const { Gateway, Wallets } = require('fabric-network');
// const fs = require('fs');
// const path = require('path');

// async function main() {
//     try {
//         // Load connection profile for Org1
//         const ccpPath = path.resolve(__dirname, '..', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
//         const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

//         // Create a new wallet
//         const walletPath = path.join(process.cwd(), 'wallet');
//         const wallet = await Wallets.newFileSystemWallet(walletPath);
//         console.log(`Wallet path: ${walletPath}`);

//         // Check if user1 is already in wallet
//         const identity = await wallet.get('user1');
//         if (!identity) {
//             console.log('User1 not found in wallet, importing...');

//             const credPath = path.resolve(__dirname, '..', 'organizations', 'peerOrganizations', 'org1.example.com', 'users', 'User1@org1.example.com', 'msp');
//             const cert = fs.readFileSync(path.join(credPath, 'signcerts', 'cert.pem')).toString();
//             const key = fs.readFileSync(path.join(credPath, 'keystore', fs.readdirSync(path.join(credPath, 'keystore'))[0])).toString();

//             const x509Identity = {
//                 credentials: {
//                     certificate: cert,
//                     privateKey: key,
//                 },
//                 mspId: 'Org1MSP',
//                 type: 'X.509',
//             };
//             await wallet.put('user1', x509Identity);
//             console.log('Successfully imported user1 into wallet');
//         }

//         // Connect gateway
//         const gateway = new Gateway();
//         // await gateway.connect(ccp, {
//         //     wallet,
//         //     identity: 'user1',
//         //     discovery: { enabled: false }
//         // });
//         await gateway.connect(ccp, {
//             wallet,
//             identity: 'user1',
//             discovery: { enabled: true, asLocalhost: true }
//         });


//         // Get network and contract
//         const network = await gateway.getNetwork('mychannel');
//         const contract = network.getContract('basic');

//         // Query ledger (get all assets)
//         const result = await contract.evaluateTransaction('GetAllAssets');
//         console.log(`Ledger query result: ${result.toString()}`);

//         await gateway.disconnect();

//     } catch (error) {
//         console.error(`Error: ${error}`);
//         process.exit(1);
//     }
// }

// main();

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
