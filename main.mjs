import bip39 from "bip39";
import bitcoinjs from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import { RegtestUtils } from "regtest-client";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import axios from "axios";
import fs from "fs";
//import * as data from './utxos.json' assert {type:"json"};

const APIPASS = process.env.APIPASS || "satoshi";
const APIURL = process.env.APIURL || "https://regtest.bitbank.cc/1";
const regtestUtils = new RegtestUtils({ APIPASS, APIURL });
const validator = (pubkey, msghash, signature) =>
  ECPair.fromPublicKey(pubkey).verify(msghash, signature);
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
const regtest = regtestUtils.network;

//console.log(data)

const updateChange = async (change) => {
  if (change == 0) {
    return 1;
  } else return 0;
};

const getTransactionsFromAddress = async (address) => {
  try {
    const resp = await axios.get(
      "https://blockstream.info/testnet/api//address/" + address + "/txs"
    );
    //console.log(resp.data[0]);
    return resp.data;
  } catch (e) {
    console.log(e);
  }
};

const getFullTransactionHashFromTransactionId = async (transactionId) => {
  try {
    const resp = await axios.get(
      "https://blockstream.info/testnet/api//tx/" + transactionId + "/hex"
    );
    //console.log(resp.data[0]);
    return resp.data;
  } catch (e) {
    console.log(e);
  }
};

const getUTXOFromAddress = async (address) => {
  try {
    const resp = await axios.get(
      "https://blockstream.info/testnet/api/address/" + address + "/utxo"
    );
    //console.log(resp.data[0]);
    return resp.data;
  } catch (e) {
    console.log(e);
  }
};

const broadcastToTestnet = async (transaction) => {
  try {
    await axios({
      method: "post",
      url: "https://blockstream.info/testnet/api/tx",
      data: transaction,
    });
  } catch (e) {
    console.log(e);
  }
};

const sendMoney = async (amountToSend, addressToSendTo) => {
  //Get the json object from UTXOS.json
  fs.readFile("utxos.json", "utf8", async function readFileCallback(err, data) {
    if (err) {
      console.log(err);
    } else {
      let utxos = JSON.parse(data).utxos; //now it an object
      let current = JSON.parse(data).current[0].address;

      const miningFee = 500;
      var totalBalance = 0;

      for (let money = 0; money < utxos.length; money++) {
        totalBalance += utxos[money].value;
      }

      if (totalBalance + miningFee < amountToSend) {
        console.log("Error! You don't have enough to send that amount");
        return 0;
      }

      //Create Transaction You have enough money
      var psbt = new bitcoinjs.Psbt({ network: bitcoinjs.networks.testnet });
      var currentBalance = 0;
      var sent = false;

      //For each UTXO that is valid
      for (let i = 0; i < utxos.length; i++) {
        currentBalance += utxos[i].value;

        var input = {
          hash: utxos[i].txid,
          index: utxos[i].vout,
          nonWitnessUtxo: Buffer.from(utxos[i].nonWitnessUtxo, "hex"),
        };
        // console.log(`nonwitutxo${i}: ${utxos[i].nonWitnessUtxo}`);
        psbt.addInput(input);

        //console.log("Do you have enough moeny with this UTXO?")
        if (currentBalance > miningFee + amountToSend) {
          psbt.addOutput({
            address: addressToSendTo,
            value: amountToSend,
          });
          psbt.addOutput({
            address: current,
            value: currentBalance - (amountToSend + miningFee),
          });

          console.log("in", psbt.txInputs);
          //console.log("out",psbt.txOutputs);
          //console.log(Buffer.from(utxos[i].pKey, 'hex'))

          psbt.signInput(
            0,
            ECPair.fromPrivateKey(Buffer.from(utxos[i].pKey, "hex"))
          );
          psbt.validateSignaturesOfInput(0, validator);
          psbt.finalizeAllInputs();
          await broadcastToTestnet(psbt.extractTransaction().toHex());
          console.log("Sent " + amountToSend + " to " + addressToSendTo);
          //console.log("The UTXO(s) that were used were:")
          //console.log("If you have enough money just use that/those UTXO(s)")
          sent = true;
          break;
        }

        if (sent) {
          break;
        }
      }
    }
  });
  /*
    for(let x = 0; x < yourAddresses.length; x++){

        var utxos = await getUTXOFromAddress(yourAddresses[x]);

        
        if(sent){
            break;
        }
    }*/
};

//const mnemonic = bip39.generateMnemonic(256)
var index = 0;
var change = 0;
var counter = 20; //Number of child addresses to create
var addresses = [];
var keyPairs = [];
var path = "m/44'/1'/0'/0/" + index;
var currentHeadIndex = 0; //Current head index is the index that has no transactions first

const mnemonicSaved =
  "clip finish garbage off nice bicycle memory mouse shy multiply bonus busy client tattoo hamster gold slam lava orange pave arm grocery midnight name";
const seed = bip39.mnemonicToSeedSync(mnemonicSaved);
const root = bip32.fromSeed(seed);
var transactions;
var lastTransactionNotEmpty = false;

//Create addresses and keypairs
//Make sure 20 children have no transaction history
for (let i = 0; i < counter; i++) {
  //Create new adddress
  const keyPair = root.derivePath(path);
  keyPairs.push(keyPair);

  let { address } = bitcoinjs.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: bitcoinjs.networks.testnet,
  });

  //Check Whether address has transactions or not
  transactions = await getTransactionsFromAddress(address);

  if (transactions.length == 0) {
    if (lastTransactionNotEmpty) {
      currentHeadIndex = i;
      lastTransactionNotEmpty = false;
    }
    lastTransactionNotEmpty = false;
  } else {
    lastTransactionNotEmpty = true;
    counter += 1;
  }

  //Continue creating addresses until you saw 20 in a row without
  index += 1;
  change = await updateChange(change);
  path = "m/44'/1'/0'/" + change + "/" + index;
  addresses.push(address);
}

var currentAddress = addresses[currentHeadIndex];
var currentAddressKeyPairs = keyPairs[currentHeadIndex];

var UsedAddresses = addresses.slice(0, currentHeadIndex);
var UsedAddressesKeyPairs = keyPairs.slice(0, currentHeadIndex);
var UtxoAddresses = [];
var UtxoKeyPairs = [];

var obj = {
  utxos: [],
  current: [],
};

obj.current.push({
  address: currentAddress,
});

for (let i = 0; i < UsedAddresses.length; i++) {
  var utxosCurrent = await getUTXOFromAddress(UsedAddresses[i]);
  //console.log(utxosCurrent)

  if (utxosCurrent.length > 0) {
    UtxoAddresses.push(UsedAddresses[i]);
    UtxoKeyPairs.push(UsedAddressesKeyPairs[i]);
  }
  for (let x = 0; x < utxosCurrent.length; x++) {
    if (utxosCurrent[x]) {
      obj.utxos.push({
        address: UsedAddresses[i], //The address associated with the UTXO
        pKey: UsedAddressesKeyPairs[i].privateKey.toString("hex"), //Keypair to sign the UTXO
        value: utxosCurrent[x].value, //The value associated with the UTXO
        txid: utxosCurrent[x].txid, //The trans ID
        vout: utxosCurrent[x].vout, //Index the UTXO is locataed at
        nonWitnessUtxo: await getFullTransactionHashFromTransactionId(
          utxosCurrent[x].txid
        ), //The hash on the whole transaction
      });
    }
  }
  //console.log(UsedAddressesKeyPairs[i].privateKey.toString("hex"))
}
let json = JSON.stringify(obj);
//console.log(json)
fs.writeFile("utxos.json", json, function (err) {
  if (err) throw err;
});

console.log("Unused Address: ", currentAddress);
console.log("Used Addresses: ", UsedAddresses);
console.log("Utxo Addresses: ", UtxoAddresses);
//console.log("All Addresses: ", addresses)

const joe = "mk4Y3aRXmG2UThf8UhbFzavgKkyckny2Ua";

sendMoney(1500, joe)
