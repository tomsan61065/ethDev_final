'use strict';

const express = require('express'); 
const keythereum = require('keythereum');
const Web3 = require('web3');
const fs = require('fs');
const cryptoJs = require("crypto-js");
const request = require("request");

const router = express.Router();
const web3 = new Web3("ws://localhost:8546");

var {
    EvaluationBin, 
    EvaluationAbi,
} = require('../data/resource.js');
const { signTX } = require('../data/signTx.js'); 

//"0x56528ec7f5cd0ca1a845d6a0c7660203b15df6fb"

let userKeyfile = require('../data/keyfile/myKey.json');
let adminPasswordHash = cryptoJs.SHA256('ethDev');

//curl --data "param1=value1&param2=value2" http://hostname/resource

// === api ===
router.get('/', (req, res) => {
    res.send('EthDev_FinalProject');
});

//
router.post("/signUp", async(req, res) => {
    let account = req.body.account;
    let passwordHash = cryptoJs.SHA256(req.body.password);
    let creatAccount = req.body.creatAccount;// bool 

    // 將資料存到DB
    // TODO


    // 是否要幫忙創造 account
    if(creatAccount != 0){
        request.post({url:'http://localhost:9999/creatAccount', form: {account: account, password: req.body.password}}, function (error, response, body){
            console.log('error:', error); // Print the error if one occurred
            if(error){
                res.send("false");
            }
            console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
            console.log('body:', body); // Print the HTML for the Google homepage.
        });
    }

    res.send("true"); 
});



// @dev 創建使用者帳戶。只有這邊要存DB紀錄 account, address, privateKeyCrypto, passwordHash
// @input account password 
router.post("/creatAccount", async (req, res) => {
    let account = req.body.account;
    let password = req.body.password;
    web3.eth.accounts.create().then(function(result){
        // 加密過私鑰
        let privateKeyCrypto = CryptoJs.AES.encrypt(JSON.stringify(result.privateKey), password).toString();

        // TODO
        // 存到DB
        //    account: account,
        //    passwordHash: cryptoJs.SHA256(password),
        //    privateKeyCrypto: privateKeyCrypto,
        //    address: result.address
        
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
    let _userAddress = req.body.userAddress;
    let data = await EvaluationContract.methods.addUser(_userAddress).encodeABI();

    let transaction = {
        data,
        nonce,
        gas: 2000000,
        gasPrice: 0,
        to: EvaluationContract.options.address,
        value: "0x0",
    };

    let rawTx = signTX(privateKey, transaction);
    web3.eth.sendSignedTransaction(rawTx).on('receipt', console.log)
    .on("error", console.log);

    res.send(userAddress); //回傳資料代表成功
});


router.post("/addNameClass", async (req, res) => {

    //需要收到的資料
    let account = req.body.account; 
    let password = req.body.password;
    let _name = req.body.name;
    let _class = req.body.class;
    let _classId = req.body.classId;

    // 資料庫抓回
    let passwordHash = cryptoJs.SHA256(password);
    let privateKey = "";
    let userAddress = "";

    // 判斷是管理員 還是 使用者 call ?
    if(passwordHash === adminPasswordHash){
        privateKey = await keythereum.recover('ethDev', userKeyfile);
        userAddress = '0x' + userKeyfile.address;
    }else{
        // 由 account 抓回: userAddress, privateKeyCrypto, passwordHash <------ TODO
        let DBpasswordHash = "";
        let privateKeyCrypto = "";
        userAddress = "";
    
        if(passwordHash !== DBpasswordHash){
            res.send("wrong password");
            return;
        }
        
        let bytes  = CryptoJs.AES.decrypt(privateKeyCrypto, password);
        privateKey = await JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    }
    
    let contractAddress = fs.readFileSync('./api/data/address.txt').toString();
    let EvaluationContract = new web3.eth.Contract(EvaluationAbi, contractAddress);
   
    let nonce = await web3.eth.getTransactionCount(userAddress);
    let data = await EvaluationContract.methods.addNameClass(_name, _class, _classId).encodeABI();
    let transaction = {
        data,
        nonce,
        gas: 2000000,
        gasPrice: 0,
        to: EvaluationContract.options.address,
        value: "0x0",
    };

    let rawTx = signTX(privateKey, transaction);
    web3.eth.sendSignedTransaction(rawTx)
    .on('receipt', console.log)
    .on("error", console.log);

    res.send(userAddress); //回傳資料代表成功
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
    let _classId = req.body.classId;
    let _commentNum = req.body.commentNum;

    let contractAddress = fs.readFileSync('./api/data/address.txt').toString();
    let EvaluationContract = new web3.eth.Contract(EvaluationAbi, contractAddress);

    let result = await EvaluationContract.methods.getVoteData(_classId, _commentNum).call();
    //let [person, text, upVote, count] = ...

    res.json(result);
});

router.post("/getDataFromClassId", async (req, res) => {
    let _classId = req.body.classId;

    let contractAddress = fs.readFileSync('./api/data/address.txt').toString();
    let EvaluationContract = new web3.eth.Contract(EvaluationAbi, contractAddress);

    let result = await EvaluationContract.methods.getDataFromClassId(_classId).call();
    //let [person, text, upVote, count] = ...

    res.json(result);
});

router.post("/getDataFromClassIdPart2", async (req, res) => {
    let _classId = req.body.classId;

    let contractAddress = fs.readFileSync('./api/data/address.txt').toString();
    let EvaluationContract = new web3.eth.Contract(EvaluationAbi, contractAddress);

    let result = await EvaluationContract.methods.getDataFromClassIdPart2(_classId).call();
    //let [person, text, upVote, count] = ...

    res.json(result);
});

router.post("/getClassIndex", async (req, res) => {
    let _index = req.body.index;

    let contractAddress = fs.readFileSync('./api/data/address.txt').toString();
    let EvaluationContract = new web3.eth.Contract(EvaluationAbi, contractAddress);

    let result = await EvaluationContract.methods.getClassIndex(_index).call();
    //let [person, text, upVote, count] = ...

    res.json(result);
});

//curl --data "classId=0&commentNum=1" http://localhost:9999/getVoteData

module.exports = router;