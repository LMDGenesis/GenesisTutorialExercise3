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
const validator = (pubkey, msghash, signature) => ECPair.fromPublicKey(pubkey).verify(msghash, signature)
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
const regtest = regtestUtils.network;

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

const sendMoney = async(amountToSend, yourAddresses, yourKeyPairs, addressToSendTo) => {

    const miningFee = 25000
    var totalBalance = 0;
    
    //For each address that has a UTXO
    for(let x = 0; x < yourAddresses.length; x++){

        //Get all of their UTXO's
        var utxos = await getUTXOFromAddress(yourAddresses[x]);

        //Add the balance of each of the UTXO's to the total balance to see how much you have
        for (let i = 0; i < utxos.length; i++) {
            totalBalance += utxos[i].value
        }
    }
    

    console.log("Your Address: ", yourAddresses)
    //console.log("Your KeyPairs: ", yourKeyPairs)
    console.log("Current Total Balance: ", totalBalance);
    console.log("Their Address: ", addressToSendTo);
    console.log()

    if(totalBalance + miningFee < amountToSend){
        console.log("Error! You don't have enough to send that amount");
    }

    //Create Transaction You have enough money
    var psbt = new bitcoinjs.Psbt({network: bitcoinjs.networks.testnet});
    var currentBalance = 0;

    for(let x = 0; x < yourAddresses.length; x++){

        var utxos = await getUTXOFromAddress(yourAddresses[x]);

        for (let i = 0; i < utxos.length; i++) {
            currentBalance += utxos[i].value

            var transactionHash = await getFullTransactionHashFromTransactionId(utxos[i].txid)
            var input = {hash: utxos[0].txid, index: utxos[0].vout, nonWitnessUtxo: Buffer.from(transactionHash,"hex")}
            psbt.addInput(input);

            //Address To KeyPair


            //console.log("Do you have enough moeny with this UTXO?")
            if(currentBalance + miningFee > amountToSend){
                psbt.addOutput({
                    address: addressToSendTo,
                    value: amountToSend,
                });

                psbt.signInput(0, ECPair.fromPrivateKey(yourKeyPairs[x].privateKey));
                psbt.validateSignaturesOfInput(0, validator);
                psbt.finalizeAllInputs();
                await broadcastToTestnet(psbt.extractTransaction().toHex());
                console.log("Sent " + amountToSend + " to " + addressToSendTo + " from " + yourAddresses[x])
                //console.log("The UTXO(s) that were used were:")
                //console.log("If you have enough money just use that/those UTXO(s)")
                break;
            }
        }
    }
}

//const mnemonic = bip39.generateMnemonic(256)
var index = 0;
var counter  = 20; //Number of child addresses to create
var addresses = [];
var keyPairs = [];
var path = "m/44'/1'/0'/0/"+index;
var currentHeadIndex = 0;//Current head index is the index that has no transactions first

const mnemonicSaved = "clip finish garbage off nice bicycle memory mouse shy multiply bonus busy client tattoo hamster gold slam lava orange pave arm grocery midnight name"
const seed = bip39.mnemonicToSeedSync(mnemonicSaved)
const root = bip32.fromSeed(seed);
var transactions;
var lastTransactionNotEmpty = false;

for (let i = 0; i < counter; i++) {

    //Create new adddress
    const keyPair = root.derivePath(path);
    keyPairs.push(keyPair);

    let { address } = bitcoinjs.payments.p2pkh({
        pubkey: keyPair.publicKey,
        network: bitcoinjs.networks.testnet,
    });

    //Check Whether address has transactions or not
    transactions = await getTransactionsFromAddress(address)
    
    if(transactions.length == 0){
        if(lastTransactionNotEmpty){
            currentHeadIndex = i;
            lastTransactionNotEmpty = false;
        }
        lastTransactionNotEmpty = false;
    }
    else{
        lastTransactionNotEmpty = true
        counter +=1;
    }

    //Continue creating addresses until you saw 20 in a row without 
    index+=1;
    path = "m/44'/1'/0'/0/"+index;
    addresses.push(address)
}

var currentAddress = addresses[currentHeadIndex];
var currentAddressKeyPairs = keyPairs[currentHeadIndex];

var UsedAddresses = addresses.slice(0,currentHeadIndex);
var UsedAddressesKeyPairs = keyPairs.slice(0,currentHeadIndex);
var UtxoAddresses = [];
var UtxoKeyPairs = [];

for (let i = 0; i < UsedAddresses.length; i++) {

    var utxos = await getUTXOFromAddress(UsedAddresses[i])
    //console.log(utxos)
    
    if(utxos.length > 0){
        UtxoAddresses.push(UsedAddresses[i])
        UtxoKeyPairs.push(UsedAddressesKeyPairs[i])
    }
}

console.log("Unused Address: ",currentAddress);
console.log("Used Addresses: ",UsedAddresses);
console.log("Utxo Addresses: ",UtxoAddresses);
//console.log("All Addresses: ", addresses)

const joe = "mk4Y3aRXmG2UThf8UhbFzavgKkyckny2Ua";

//sendMoney(500, UtxoAddresses, UtxoKeyPairs, joe)