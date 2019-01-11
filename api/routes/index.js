'use strict';

const express = require('express'); 
const keythereum = require('keythereum');
const Web3 = require('web3');
const fs = require('fs');
const cryptoJs = require("crypto-js");
const request = require("request");

const readline = require('readline');
const {google} = require('googleapis');

const router = express.Router();
const web3 = new Web3("ws://localhost:8546");

var {
    EvaluationBin, 
    EvaluationAbi,
} = require('../data/resource.js');
const { signTX } = require('../data/signTx.js'); 

//"0x56528ec7f5cd0ca1a845d6a0c7660203b15df6fb"

let userKeyfile = require('../data/keyfile/myKey.json');
let adminPasswordHash = cryptoJs.SHA256('ethDev').toString();

//curl --data "param1=value1&param2=value2" http://hostname/resource

// === api ===
router.get('/', async (req, res) => {
//    let resulut = await getGSData("104703052");
//    console.log(resulut);
    res.send('EthDev_FinalProject');
//    console.log("EEEEEEEEEE");
//    await addGSData("103753011", "Hash!@#", "Pcrypto", "0x5566");
});

router.post("/signUp", async(req, res) => {
    let account = req.body.account;
    let passwordHash = cryptoJs.SHA256(req.body.password).toString();
    let creatAccount = req.body.creatAccount;// bool 
    let address = req.body.address; // 沒有 address 就會是 "" 之類的 string
    
    // 是否要幫忙創造 account
    if(creatAccount != 0){ // 由 creatAccount 那邊紀錄 帳號 密碼 pKey address
        request.post({url:'http://localhost:9999/creatAccount', form: {account: account, password: req.body.password}}, function (error, response, body){
            console.log('error:', error); // Print the error if one occurred
            if(error){
                res.send("false");
                return;
            }
            console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
            console.log('body:', body); // Print the HTML for the Google homepage.
            address = body;
        });

    }else{
        // 將資料存到DB
        await addGSData(account, passwordHash, "userHold", address);
    }
    
    //addUser
    request.post({url:'http://localhost:9999/addUser', form: {userAddress:address}}, function (error, response, body){
        console.log('error:', error); // Print the error if one occurred
        if(error){
            res.send("false");
            return;
        }
        console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        console.log('body:', body); // Print the HTML for the Google homepage.
    });
    console.log("true");
    res.send("true"); 
});



// @dev 創建使用者帳戶。這邊要存DB紀錄 account, address, privateKeyCrypto, passwordHash
// @input account password 
router.post("/creatAccount", async (req, res) => {
    let account = req.body.account;
    let password = req.body.password;
    let passwordHash = cryptoJs.SHA256(password).toString();
    let result = await web3.eth.accounts.create();

    // 加密過私鑰
    let privateKeyCrypto = await cryptoJs.AES.encrypt(JSON.stringify(result.privateKey), password).toString();

    // 存到DB
    await addGSData(account, passwordHash, privateKeyCrypto, result.address);

    res.send(result.address);
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
    web3.eth.sendSignedTransaction(rawTx)
    .on('receipt', (receipt) => {
        res.send(receipt.transactionHash); //回傳TX代表成功
    })
    .on("error", (error) => {
        res.send("txFail");
    });

    
});


router.post("/addNameClass", async (req, res) => {

    //需要收到的資料
    let account = req.body.account; 
    let password = req.body.password;
    let _name = req.body.name;
    let _class = req.body.class;
    let _classId = req.body.classId;
    let passwordHash = cryptoJs.SHA256(password).toString();
    
    // 將從資料庫得到的資料
    let privateKey = "";
    let userAddress = "";

    // 判斷是管理員 還是 使用者 call ?
    if(passwordHash === adminPasswordHash){
        privateKey = await keythereum.recover('ethDev', userKeyfile);
        userAddress = '0x' + userKeyfile.address;
    }else{
        // 由 account 抓回: userAddress, privateKeyCrypto, passwordHash <------ TODO
        let DBdata = await getGSData(account);
        let DBpasswordHash = DBdata[1];
        let privateKeyCrypto = DBdata[2];
        userAddress = DBdata[3];
    
        if(passwordHash !== DBpasswordHash){
            res.send("wrong password");
            return;
        }
        
        let bytes  = cryptoJs.AES.decrypt(privateKeyCrypto, password);
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

    //需要收到
    let account = req.body.account;
    let password = req.body.password;
    
    //要回傳的
    let _classId = req.body.classId;
    //作業、考試、點名
    let _homework = req.body.homework;
    let _hwLength = req.body.hwLength;
    let _test = req.body.test;
    let _testPrep = req.body.testPrep;
    let _groupProject = req.body.groupProject;
    let _rollCall = req.body.rollCall;
    let _finalScore = req.body.finalScore;
    //四個分數
    let _teacher = req.body.teacher;
    let _usefulness = req.body.usefulness;
    let _effectiveness = req.body.effectiveness;
    let _mental = req.body.mental;

    // 資料庫會用到
    let passwordHash = cryptoJs.SHA256(password).toString();
    let privateKey = "";
    let userAddress = "";

    // 判斷是管理員 還是 使用者 call ?
    if(passwordHash === adminPasswordHash){
        privateKey = await keythereum.recover('ethDev', userKeyfile);
        userAddress = '0x' + userKeyfile.address;
    }else{
        // 由 account 抓回: userAddress, privateKeyCrypto, passwordHash <------ TODO
        let DBdata = await getGSData(account);
        let DBpasswordHash = DBdata[1];
        let privateKeyCrypto = DBdata[2];
        userAddress = DBdata[3];
    
        if(passwordHash !== DBpasswordHash){
            res.send("wrong password");
            return;
        }
        
        let bytes  = cryptoJs.AES.decrypt(privateKeyCrypto, password);
        privateKey = await JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    }
    
    let contractAddress = fs.readFileSync('./api/data/address.txt').toString();
    let EvaluationContract = new web3.eth.Contract(EvaluationAbi, contractAddress);
   
    let nonce = await web3.eth.getTransactionCount(userAddress);
    let data = await EvaluationContract.methods.addNameClassValue(_classId, _homework, _hwLength, _test, _testPrep, _groupProject, _rollCall, _finalScore, _teacher, _usefulness, _effectiveness, _mental).encodeABI();
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

router.post("/addNameClassComment", async (req, res) => {
    //需要拿的
    let account = req.body.account;
    let password = req.body.password;
    let _classId = req.body.classId;
    //評論
    let _comment = req.body.comment;

    // 將從資料庫得到的資料
    let passwordHash = cryptoJs.SHA256(password).toString();
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
        
        let bytes  = cryptoJs.AES.decrypt(privateKeyCrypto, password);
        privateKey = await JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    }
    
    let contractAddress = fs.readFileSync('./api/data/address.txt').toString();
    let EvaluationContract = new web3.eth.Contract(EvaluationAbi, contractAddress);
   
    let nonce = await web3.eth.getTransactionCount(userAddress);
    let data = await EvaluationContract.methods.addNameClassComment(_classId,_comment).encodeABI();
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

router.post("/addVoteToComment", async (req, res) => {
    //需要拿的
    let account = req.body.account;
    let password = req.body.password;
    let _classId = req.body.classId;
    //評論評價
    let _commentNum = req.body.commentNum;
    let _vote = req.body.vote;

    // 將從資料庫得到的資料
    let passwordHash = cryptoJs.SHA256(password).toString();
    let privateKey = "";
    let userAddress = "";

    // 判斷是管理員 還是 使用者 call ?
    if(passwordHash === adminPasswordHash){
        privateKey = await keythereum.recover('ethDev', userKeyfile);
        userAddress = '0x' + userKeyfile.address;
    }else{
        // 由 account 抓回: userAddress, privateKeyCrypto, passwordHash <------ TODO
        let DBdata = await getGSData(account);
        let DBpasswordHash = DBdata[1];
        let privateKeyCrypto = DBdata[2];
        userAddress = DBdata[3];
    
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
    let data = await EvaluationContract.methods.addVoteToComment(_classId,_commentNum,_vote).encodeABI();
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


// === google api function ====
const mySheetId = '150O99ZpMS-lHbK7wBgefgIZWOMpTeHvqieST1f7Y8oU';

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']; //這邊決定該 sheet 的 ReadOnly or Write
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// 將 google api callback 全改成 promise 來用 async/await

async function getGSData(account){
    // Load client secrets from a local file.
    let content = fs.readFileSync ('credentials.json', async (err, content) => {
        if (err) return console.log('Error loading client secret file:', err);
    });
    // Authorize a client with credentials, then call the Google Sheets API.
    let auth = await authorize(JSON.parse(content));
    let result = await getGoogleSheetData(auth, account);
//    console.log("getGSData");
//    console.log(result);
    return result;
    //updateGoogleSheet(auth);
}

async function addGSData(account, passwordHash, privateKeyCrypto, address){
    let content = fs.readFileSync ('credentials.json',(err, content) => {
        if (err) return console.log('Error loading client secret file:', err);
    });
    let auth = await authorize(JSON.parse(content));
    updateGoogleSheet(auth, account, passwordHash, privateKeyCrypto, address);
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 */
function authorize(credentials /*, callback*/ ) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    //console.log("o 2 C");
    //console.log(oAuth2Client);

    // Check if we have previously stored a token.
    let token = fs.readFileSync(TOKEN_PATH, async (err, token) => { //改成 promisify 版本
        if (err){
            return await getNewToken(oAuth2Client);
        }
    });

    oAuth2Client.setCredentials(JSON.parse(token));
    //console.log("readFile token");
    //console.log(oAuth2Client);
    return (oAuth2Client);
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 */
function getNewToken(oAuth2Client) {
    return new Promise(function(resolve, reject){
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        console.log('Authorize this app by visiting this url:', authUrl);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
                if (err){ 
                    console.error('Error while trying to retrieve access token', err);
                    reject(err);
                }
                oAuth2Client.setCredentials(token);
                // Store the token to disk for later program executions
                fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                    if (err) console.error(err);
                    console.log('Token stored to', TOKEN_PATH);
                });
                resolve (oAuth2Client);
            });
        });
    });
}

/**
 * Prints getGoogleSheetData
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
function getGoogleSheetData(auth, account) {
    return new Promise(function(resolve, reject){
        const sheets = google.sheets({version: 'v4', auth});
        sheets.spreadsheets.values.get({
            spreadsheetId: mySheetId,
            range: 'users!A1:E',
        }, (err, res) => {
            if (err){ 
                console.log('The API returned an error: ' + err);
                reject(err);
            }
            const rows = res.data.values;
            if (rows.length) {
                // Print columns A and E, which correspond to indices 0 and 4.
                console.log(rows);
                for(let i = 0; i < rows.length; i++){
                    if(rows[i][0] === account){
                    //    console.log(rows[i]);
                        resolve(rows[i]);
                    }
                }
                resolve("no account");
            } else {
                console.log('No data found.');
            }
        });
    });
}
    
//https://stackoverflow.com/questions/49161249/google-sheets-api-how-to-find-a-row-by-value-and-update-its-content
    
async function updateGoogleSheet(auth, account, passwordHash, privateKeyCrypto, address) {
    let request = {
        auth: auth,
        spreadsheetId: mySheetId,
        range: "users!A2:E", //encodeURI('表單回應 1'),
        insertDataOption: 'INSERT_ROWS',
        valueInputOption: 'RAW',
        resource: {
            "values": [
                [account, passwordHash, privateKeyCrypto, address],
            ],
        }
    };
    const sheets = google.sheets('v4');
    sheets.spreadsheets.values.append(request, function(err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
    //    console.log(response);
    });
}

// https://sheets.googleapis.com/v4/spreadsheets/150O99ZpMS-lHbK7wBgefgIZWOMpTeHvqieST1f7Y8oU/values/users!A2:E

module.exports = router;