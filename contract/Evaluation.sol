pragma solidity >=0.4.22 <0.6.0;

import "./SafeMath.sol";
import "./Evaluation.sol";

contract Evaluation{
    using SafeMath for uint256;
    using SafeMath for int256;

    address payable private master;
    address public tokenAddress;

    struct comments{
        uint count; //計數器
    
        address[] person; //評論者
        string[] text; //內容
        int[] upVote; //他人對此評價總分
        mapping (address => mapping(uint => int8)) used; //他人對此的評價
        //雙層 mapping 處理 [該使用者][某個評論] = -1(噓) 0(無評論) 1(推)
    }
    
    struct nameClass{
        uint classId; //課堂的獨特ID
        string class; //課程名稱
        string name; //老師名稱
        
        uint homework; //作業數量 0~5,5~10,10~15,>15
        uint hwLength; //平均作業耗時 0~1,1~2,2~3,>3
        uint test; //考試數量 0~3,3~6,6~9,>9
        uint testPrep; //考試準備耗時 0~2,2~4,4~6,>6
        uint groupProject; //有無分組作業 0=false 1=ture
        uint rollCall; //點名次數
        uint finalScore; //期末成績 0~100

        //四個分數
        uint teacher;
        uint usefulness;
        uint effectiveness;
        uint mental;
        
        uint count; //計數器，多少人填寫了
        mapping (address => bool) used; //是否填寫過
    }
    
    //id 與對應的 老師課程
    mapping (uint256 => nameClass) private classes;
    uint[] private nameClassIndex;
    
    mapping (uint256 => comments) private commentsArray;//某課程ID與它的評論們

    mapping (address => uint256) private users; //是否為註冊過使用者
    
    //event 們
    event addUserEvent(address indexed master, address indexed user, uint256 timestamp);
    event addNameClassEvent(address indexed who, uint256 indexed classId, uint256 timestamp);
    event addNameClassValueEvent(uint256 indexed classId, uint256 timestamp);
    event addNameClassCommentEvent(address indexed who, uint256 timestamp);

    constructor(address _tokenAddress) public payable{
        master = msg.sender;
        tokenAddress = _tokenAddress;
    }

    // 由 master 新增註冊過的使用者
    function addUser(address user) external {
        require(msg.sender == master);

        users[user] = 1;

        emit addUserEvent(msg.sender, user, now);
    }

    // 新增 老師課程
    function addNameClass(string calldata name, string calldata class, uint classId) external {
        require(msg.sender == master || users[msg.sender] == 1); //確認權限
        require(classes[classId].classId == 0); //要沒新增過才行
        
        nameClassIndex.push(classId);
        nameClass storage temp = classes[classId];
        temp.name = name;
        temp.class = class;
        temp.classId = classId;

        uint tokenLeft = ERC20(tokenAddress).balanceOf(address(this));
        if(tokenLeft >= 1 ether){ //合約還有 token 就獎勵 (1 個 token 為單位)
            ERC20(tokenAddress).transfer(msg.sender, 1 ether);
        }

        emit addNameClassEvent(msg.sender, classId, now);
    }
    
    // 新增 課堂資訊
    function addNameClassValue(
        uint classId,
        uint homework, //作業數量
        uint hwLength, //平均作業耗時
        uint test, //考試數量
        uint testPrep, //考試準備耗時
        uint groupProject, //有無分組作業 0=false 1=ture
        uint rollCall, //點名次數
        uint finalScore, //期末成績 0~100
        //四個分數
        uint teacher,
        uint usefulness,
        uint effectiveness,
        uint mental
        ) external {
        require(msg.sender == master || users[msg.sender] == 1); //有授權的使用者
        require(classes[classId].used[msg.sender] == false); //確認是否評價過
        require(classes[classId].classId != 0); //確認該課堂存在
        
        
        classes[classId].homework = classes[classId].homework.add(homework);
        classes[classId].hwLength = classes[classId].hwLength.add(hwLength);
        classes[classId].test = classes[classId].test.add(test);
        classes[classId].testPrep = classes[classId].testPrep.add(testPrep);
        classes[classId].groupProject = classes[classId].groupProject.add(groupProject);
        classes[classId].rollCall = classes[classId].rollCall.add(rollCall);
        classes[classId].finalScore = classes[classId].finalScore.add(finalScore);
        //四個分數
        classes[classId].teacher = classes[classId].teacher.add(teacher);
        classes[classId].usefulness = classes[classId].usefulness.add(usefulness);
        classes[classId].effectiveness = classes[classId].effectiveness.add(effectiveness); 
        classes[classId].mental = classes[classId].mental.add(mental);
        
        classes[classId].count = classes[classId].count.add(1);
        classes[classId].used[msg.sender] == true;
        
        uint tokenLeft = ERC20(tokenAddress).balanceOf(address(this));
        if(tokenLeft >= 1 ether){ //合約還有 token 就獎勵 (1 個 token 為單位)
            ERC20(tokenAddress).transfer(msg.sender, 1 ether);
        }

        emit addNameClassValueEvent(classId, now);
    }
    
    // 新增 課堂評論
    function addNameClassComment(uint classId, string calldata _comment) external {
        require(users[msg.sender] == 1 || msg.sender == master);
        require(classes[classId].classId != 0); //該課堂存在
        comments storage temp = commentsArray[classId];
        temp.person.push(msg.sender);
        temp.text.push(_comment);
        temp.upVote.push(0);
        temp.count = temp.count.add(1);
        
        emit addNameClassCommentEvent(msg.sender, now);
    }

    // 新增 評論評價
    function addVoteToComment(uint classId, uint _commentNum, int8 _vote) external{
        require(users[msg.sender] == 1 || msg.sender == master);
        require(classes[classId].classId != 0); //該課堂存在
        require(commentsArray[classId].count > _commentNum); //該評論存在

        comments storage temp = commentsArray[classId];

        if(temp.used[msg.sender][_commentNum] == _vote){ //同樣的評價
            return;
        }
        
        // 有 vote 不是 1 0 -1 的漏洞
        if(temp.used[msg.sender][_commentNum] == 0){ //沒評價過
            temp.upVote[_commentNum] = temp.upVote[_commentNum].add(_vote); //注意，是 int -1, 0, 1
            temp.used[msg.sender][_commentNum] = _vote;
        }else{
            temp.upVote[_commentNum] = temp.upVote[_commentNum].add(_vote).add(_vote); // 本來 +1 的話: +(-1) +(-1)，反之亦然
            temp.used[msg.sender][_commentNum] = _vote;
        }
    }

    // 取回 評論資訊
    function getVoteData(uint classId, uint _commentNum) external view
        returns(address, string memory, int, uint){
        
        if(commentsArray[classId].count == 0 || _commentNum <= commentsArray[classId].count){ //確保不會 access 到陣列外
            return (address(0), "null", 0, commentsArray[classId].count);
        }

        require(_commentNum < commentsArray[classId].count);
        return(
            commentsArray[classId].person[_commentNum],
            commentsArray[classId].text[_commentNum],
            commentsArray[classId].upVote[_commentNum],
            commentsArray[classId].count
        );
    }
    
    // 取回 課堂資訊
    function getDataFromClassId(uint classId) external view 
        returns(string memory, string memory, uint, uint, uint, uint, uint, uint, uint){
        nameClass memory c = classes[classId]; //避免 stack too deep 問題
        return(
            c.class,
            c.name,
            c.homework,
            c.hwLength,
            c.test,
            c.testPrep,
            c.groupProject,
            c.rollCall,
            c.finalScore
        );
    }
    function getDataFromClassIdPart2(uint classId) external view 
        returns(uint, uint, uint, uint, uint){
        nameClass memory c = classes[classId]; //避免 stack too deep 問題
        return(
            c.teacher,
            c.usefulness,
            c.effectiveness,
            c.mental,
            c.count
        );
    }

    // 取回總共有哪些資料
    function getClassIndex(uint index) 
    external 
    view
    returns(uint, uint){
        if(nameClassIndex.length == 0 || nameClassIndex.length <= index){
            return(nameClassIndex.length, 0);
        }
        return(nameClassIndex.length, nameClassIndex[index]);
    }

    
    // fallback function。偷走所有轉過來的 eth
    function () external payable {
        master.transfer(msg.value);
    }

    // 更換token address
    function changeTokenAddress(address _tokenAddress) public {
        require(msg.sender == master, "Master required.");
        tokenAddress = _tokenAddress;
    }

}
