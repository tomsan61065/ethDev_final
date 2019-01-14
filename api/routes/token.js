'use strict';

const express = require('express');
const keythereum = require('keythereum');
const Web3 = require('web3');
const fs = require('fs');
const request = require("request");

//http://expressjs.com/zh-tw/guide/routing.html
const router = express.Router(); 
const web3 = new Web3("ws://localhost:8546");

var {
    nccuTokenBin, 
    nccuTokenAbi,
} = require('../data/nccuToken.js');
const { signTX } = require('../data/signTx.js'); 
let userKeyfile = require('../data/keyfile/myKey.json');
  

router.get('/', (req, res) => { // 是 localhost:port/token/ 的訊息
    res.send('nccu token api');
});

let tokenAddress = "";

router.get('/create', async (req, res) => {
    let privateKey = await keythereum.recover('ethDev', userKeyfile);
    let nonce = await web3.eth.getTransactionCount('0x' + userKeyfile.address);

    let myContract = new web3.eth.Contract(
        nccuTokenAbi,
    //    { gas: 4700000, gasPrice: 0 },
    );
    let data = await myContract
    .deploy({
        data: nccuTokenBin, 
        arguments: ["NCCUToken", "NCCU", 18, 5566], // constructor 需要參數的話
    }).encodeABI();

    let transaction = {
        data,
        nonce,
        gas: 4000000,
        gasPrice: 0,
        value: '0x0',
    };

    let rawTx = signTX(privateKey, transaction);
    web3.eth.sendSignedTransaction(rawTx).on('receipt', (receipt) => {
        console.log(receipt.contractAddress)
        tokenAddress = receipt.contractAddress;

        res.send(receipt.contractAddress);
    })
    .on("error", console.log);
    
});

router.get('/transfer', async (req, res) => { //自動把 master token 轉到 contract
    let privateKey = await keythereum.recover('ethDev', userKeyfile);
    let nonce = await web3.eth.getTransactionCount('0x' + userKeyfile.address);
    let contractAddress = fs.readFileSync('./api/data/address.txt').toString();

    const myContract = new web3.eth.Contract(
        nccuTokenAbi,
        tokenAddress,
    );

    let balanceM = await myContract.methods.balanceOf(userKeyfile.address).call();
    let data = await myContract.methods.transfer(contractAddress, balanceM).encodeABI();

    let transaction = {
        data,
        nonce,
        gas: 2000000,
        gasPrice: 0,
        to: tokenAddress,
        value: "0x0",
    };

    let rawTx = signTX(privateKey, transaction);
    web3.eth.sendSignedTransaction(rawTx)
    .on('receipt', (receipt) => {
        res.send(receipt.transactionHash); //回傳TX代表成功
    })
    .on("error", (error) => {
        res.send("txFail");
    });
});

router.post('/mint', async (req, res) => {
    let _value = req.body.value;

    let privateKey = await keythereum.recover('ethDev', userKeyfile);
    let nonce = await web3.eth.getTransactionCount('0x' + userKeyfile.address);

    const myContract = new web3.eth.Contract(
        nccuTokenAbi,
        tokenAddress,
    );

    let data = await myContract.methods.mint(userKeyfile.address, _value).encodeABI();

    let transaction = {
        data,
        nonce,
        gas: 2000000,
        gasPrice: 0,
        to: tokenAddress,
        value: "0x0",
    };

    let rawTx = signTX(privateKey, transaction);
    web3.eth.sendSignedTransaction(rawTx)
    .on('receipt', (receipt) => {
        res.send(receipt.transactionHash); //回傳TX代表成功
    })
    .on("error", (error) => {
        res.send("txFail");
    });
});

router.get('/balanceOf', async (req, res) => {
    let contractAddress = fs.readFileSync('./api/data/address.txt').toString();
    const myContract = new web3.eth.Contract(
        nccuTokenAbi,
        tokenAddress,
    );

    let balanceM = await myContract.methods.balanceOf(userKeyfile.address).call();
    let balanceC = await myContract.methods.balanceOf(contractAddress).call();

    res.json({
        master: balanceM,
        contract: balanceC,
    });
});


module.exports = router;