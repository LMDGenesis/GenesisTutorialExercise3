import bip39 from 'bip39'
import bitcoinjs from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32';
import { RegtestUtils } from 'regtest-client';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import axios from 'axios';

const APIPASS = process.env.APIPASS || 'satoshi';
const APIURL = process.env.APIURL || 'https://regtest.bitbank.cc/1';
const regtestUtils = new RegtestUtils({ APIPASS, APIURL });

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
const regtest = regtestUtils.network;

const mnemonic = bip39.generateMnemonic(256)
const path = "m/44'/1'/0'/0/0";

const validator = (pubkey, msghash, signature) => ECPair.fromPublicKey(pubkey).verify(msghash, signature)

//Generates random mnemonic
//console.log(mnemonic)
//Overiting for conistatncy
const mnemonicSaved = "clip finish garbage off nice bicycle memory mouse shy multiply bonus busy client tattoo hamster gold slam lava orange pave arm grocery midnight name"
//console.log(mnemonicSaved)//Prints Mnemon

const seed = bip39.mnemonicToSeedSync(mnemonicSaved)
//Taking a mnemonic phrase to a list of 64 numbers that stay consistant of the phrase you enter
//console.log(seed)

//Get the seed from mnemonic already made
//Use bip32 to derive children from taht key with the path

//Get the bip32 root from seed
const root = bip32.fromSeed(seed);
//Get the keyPair from the root
const keyPair = root.derivePath(path);
//console.log("KeyPair: ", keyPair)

const { address } = bitcoinjs.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: bitcoinjs.networks.testnet,
});


const getTransactionsFromAddress = async (address) => {
    try {
        const resp = await axios.get('https://blockstream.info/testnet/api//address/' + address + "/txs");
        //console.log(resp.data[0]);
        return resp.data;

    } catch (e) {
        console.log(e)
    }
}

const getFullTransactionHashFromTransactionId = async (transactionId) => {
    try {
        const resp = await axios.get('https://blockstream.info/testnet/api//tx/' + transactionId + '/hex');
        //console.log(resp.data[0]);
        return resp.data;

    } catch (e) {
        console.log(e)
    }
}

const getUTXOFromAddress = async (address) => {
    try {
        const resp = await axios.get('https://blockstream.info/testnet/api/address/' + address + '/utxo');
        //console.log(resp.data[0]);
        return resp.data;

    } catch (e) {
        console.log(e)
    }
}

const broadcastToTestnet = async(transaction) => {
    try {
            await axios({
                method: 'post',
                url: 'https://blockstream.info/testnet/api/tx',
                data: transaction
            });

    } catch (e) {
        console.log(e)
    }
}

const sendMoney = async(amountToSend, yourAddress, addressToSendTo) => {

    const transactions = await getTransactionsFromAddress(address);
    const utxos = await getUTXOFromAddress(address);
    //console.log(utxos);
    const miningFee = 15000
    var totalBalance = 0;

    for (let i = 0; i < utxos.length; i++) {
        totalBalance += utxos[i].value
    }

    console.log("Your Address: ", yourAddress)
    console.log("Current Total Balance: ", totalBalance);
    console.log("Their Address: ", addressToSendTo);
    console.log()

    if(totalBalance + miningFee < amountToSend){
        console.log("Error! You don't have enough to send that amount");
    }

    //Create Transaction You have enough money
    var psbt = new bitcoinjs.Psbt({network: bitcoinjs.networks.testnet});
    var currentBalance = 0;
    for (let i = 0; i < utxos.length; i++) {
        currentBalance += utxos[i].value

        var transactionHash = await getFullTransactionHashFromTransactionId(utxos[i].txid)
        var input = {hash: utxos[0].txid, index: utxos[0].vout, nonWitnessUtxo: Buffer.from(transactionHash,"hex")}
        psbt.addInput(input);

        //console.log("Do you have enough moeny with this UTXO?")
        if(currentBalance + miningFee > amountToSend){
            psbt.addOutput({
                address: addressToSendTo,
                value: amountToSend,
            });

            psbt.signInput(0, ECPair.fromPrivateKey(keyPair.privateKey));
            psbt.validateSignaturesOfInput(0, validator);
            psbt.finalizeAllInputs();
            await broadcastToTestnet(psbt.extractTransaction().toHex());
            console.log("Sent " + amountToSend + " to " + addressToSendTo + " from " + yourAddress)
            //console.log("The UTXO(s) that were used were:")
            //console.log("If you have enough money just use that/those UTXO(s)")
            break;
        }
    }
}

const christiansTestNetAddress = "miXM6nD9LKsJds61B2AhsEJjNVXU6UJzRV";

sendMoney(5000, address, christiansTestNetAddress)