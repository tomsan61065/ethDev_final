'use strict';

const express = require('express'); 
const keythereum = require('keythereum');
const Web3 = require('web3');
const fs = require('fs')
const cryptoJs = require("crypto-js");


const router = express.Router();
const web3 = new Web3("ws://localhost:8546");

var {
    EvaluationBin, 
    EvaluationAbi,
} = require('../data/resource.js');
const { signTX } = require('../data/signTx.js'); 

//"0x56528ec7f5cd0ca1a845d6a0c7660203b15df6fb"

let userKeyfile = require('../data/keyfile/myKey.json');

// === api ===
router.get('/', (req, res) => {
  res.send('EthDev_FinalProject');
});

// @dev 創建使用者帳戶。只有這邊要存DB紀錄 人 <=> address
// @input account password 
router.post("/creatAccount", async (req, res) => {
    let account = req.body.account;
    let passwordHash = cryptoJs.SHA256(req.body.password);
    web3.eth.accounts.create().then(function(result){
        // account , 加密過私鑰
        let privateKeyHash = CryptoJs.AES.encrypt(JSON.stringify(result.privateKey), passwordHash).toString();
        // address
        let userAddress = result.address;
    });

});


// @dev 藉由 api 將 Evaluation contract 部屬上鏈
router.get("/create" , async(req, res) => {
    let privateKey = await keythereum.recover('ethDev', userKeyfile);
    let nonce = await web3.eth.getTransactionCount('0x' + userKeyfile.address);
    
    let myContract = new web3.eth.Contract(
        EvaluationAbi,
    //    { gas: 4700000, gasPrice: 0 },
    );
    let data = await myContract
    .deploy({
        data: EvaluationBin, 
        // arguments: [arg1], // constructor 需要參數的話
    }).encodeABI();

    let transaction = {
        data,
        nonce,
        gas: 4500000,
        gasPrice: 0,
        value: '0x0',
    };

    let rawTx = signTX(privateKey, transaction);
    web3.eth.sendSignedTransaction(rawTx).on("receipt", (receipt) => {
        // @dev output txt file to store contract address
        fs.writeFileSync("./api/data/address.txt", receipt.contractAddress);
        console.log(receipt.contractAddress);
        
        res.json({
            test: "test",
            address : receipt.contractAddress,
        });
    })
    .on("error", console.log);

});


// @dev 由管理員新增使用者
// @address userAddress
router.post("/addUser", async (req, res) => {
    let contractAddress = fs.readFileSync('./api/data/address.txt').toString(); //這個是以 app.js 的位置出發
    let EvaluationContract = new web3.eth.Contract(EvaluationAbi, contractAddress);
    let privateKey = await keythereum.recover('ethDev', userKeyfile);


    let nonce = await web3.eth.getTransactionCount('0x' + userKeyfile.address);
    let userAddress = req.body.userAddress;
    let data = await EvaluationContract.methods.addUser(userAddress).encodeABI();

    let transaction = {
        data,
        nonce,
        gas: 2000000,
        gasPrice: 0,
        to: EvaluationContract.options.address,
        value: "0x0",
    };

    let rawTx = signTX(privateKey, transaction);
    web3.eth.sendSignedTransaction(rawTx).on('receipt', console.log);
    .on("error", console.log);

    res.send(userAddress); //回傳資料代表成功
});


router.post("/addNameClass", async (req, res) => {
    // TODO
    // 判斷是管理員 還是 使用者 call 
    let userAccount = req.body.userAccount;
    // 由 account 抓回私鑰 與 userAddress
    // google excel 抓回
    // 私鑰 obj
    // let privateKeyHash = google excel 抓回來的加密過後私鑰
    // 地址
    // let userAddress = google excel 抓回來的address

    // 用 passwordHash 解密 
    let passwordHash = cryptoJs.SHA256(req.body.password);
    let bytes  = CryptoJs.AES.decrypt(privateKeyHash, passwordHash);
    let privateKey = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    let nonce = await web3.eth.getTransactionCount('0x' + userAddress);

});

router.post("/addNameClassValue", async (req, res) => {
    // TODO
});

router.post("/addNameClassComment", async (req, res) => {
    // TODO
});

router.post("/addVoteToComment", async (req, res) => {
    // TODO
});

// @dev 取回評論
// @uint classId, commentNum
router.post("/getVoteData", async (req, res) => {
    let contractAddress = fs.readFileSync('./api/data/address.txt').toString(); 
    let EvaluationContract = new web3.eth.Contract(EvaluationAbi, contractAddress);
    let classId = req.body.classId;
    let commentNum = req.body.commentNum;

    let result = await EvaluationContract.methods.getVoteData(classId, commentNum).call();
    //let [person, text, upVote, count] = ...

    res.send(result);
});

router.post("/getDataFromClassId", async (req, res) => {
    // TODO
});

router.post("/getDataFromClassIdPart2", async (req, res) => {
    // TODO
});

module.exports = router;