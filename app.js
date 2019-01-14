'use strict';

const express = require('express');

const path = require('path'); //能觸裡檔案路徑問題，win 跟 unix 差異

const logger = require('morgan'); //日誌功能

const cookieParser = require('cookie-parser'); //處裡 cookie 相關

const bodyParser = require('body-parser'); // 處裡收到的 req 的 body(不同的請求、編碼)

const cors = require('cors'); //cross domain (允許非此domain的人可call API))

const index = require('./api/routes/index');
const nccuToken = require('./api/routes/token');

const app = express();

const portNum = 9999;

/**** server configuration ****/

app.use(cookieParser()); //使用 cookieParser

//處理 post 
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // js跟browser encode規則不一樣
app.use(cors());
app.use(logger('dev')); //調用 morgan 的日誌功能

app.use('/', index);
app.use('/token', nccuToken);

/**** error handlers ****/

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

if (app.get('env') === 'development') {
  app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.json({
      message: err.message,
      error: err,
    });
  });
}

app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: {},
  });
});

app.listen(portNum);
console.log("now listening at port " + portNum);

module.exports = app;
