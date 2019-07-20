if (typeof window !== 'undefined') {
  var arrStructure = [];
  var arrApiDocs;
} else {
  global.arrStructure = [];
  global.arrApiDocs;
  var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
  module.exports = {
    get: function () {
       return getDocs();
    },
  };
}

const API_URL = "https://cors.global.ssl.fastly.net/api",
      DOCS_URL = "https://cors.global.ssl.fastly.net/docs";

var oSections = {},
    oTitles = {},
    arrSections = [],
    arrDocs = [],
    procsRunning = 0;

function escapeHTML(html) {
    var eTmp = document.createElement('textarea');
    eTmp.textContent = html;
    return eTmp.innerHTML;
}

function unescapeHTML(html) {
    var eTmp = document.createElement('textarea');
    eTmp.innerHTML = html;
    return eTmp.textContent;
}

function getElement(id) { try { return document.getElementById(id); } catch(err) { throw new Error(err); } };

function getTimeStamp(){
	function pad(n) {return ('0' + n.toString()).slice(-2); }
	var d = new Date();
	return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function log(msgContent) {
	getElement("log").innerHTML += `${getTimeStamp()} - ${escapeHTML(msgContent)}\n`;
}

function pushObjKeyVal(obj,key,val) {
  if (!(key in obj)) obj[key] = [];
  obj[key].push(val);
}

// https://medium.freecodecamp.org/three-ways-to-title-case-a-sentence-in-javascript-676a9175eb27 (Method 3)
function titleCase(str) {
  return str.toLowerCase().split(' ').map(function(word) {
    return word.replace(word[0], word[0].toUpperCase());
  }).join(' ');
}

function getResponseStatus(iCode) {
	let oClass={1:"Informational",2:"Success",3:"Redirection",4:"Client Error",5:"Server Error"};
	let oCode={100:"Continue",101:"Switching Protocols",102:"Processing",200:"OK",201:"Created",202:"Accepted",203:"Non-authoritative Information",204:"No Content",205:"Reset Content",206:"Partial Content",207:"Multi-Status",208:"Already Reported",226:"IM Used",300:"Multiple Choices",301:"Moved Permanently",302:"Found",303:"See Other",304:"Not Modified",305:"Use Proxy",307:"Temporary Redirect",308:"Permanent Redirect",400:"Bad Request",401:"Unauthorized",402:"Payment Required",403:"Forbidden",404:"Not Found",405:"Method Not Allowed",406:"Not Acceptable",407:"Proxy Authentication Required",408:"Request Timeout",409:"Conflict",410:"Gone",411:"Length Required",412:"Precondition Failed",413:"Payload Too Large",414:"Request-URI Too Long",415:"Unsupported Media Type",416:"Requested Range Not Satisfiable",417:"Expectation Failed",418:"I'm a teapot",421:"Misdirected Request",422:"Unprocessable Entity",423:"Locked",424:"Failed Dependency",426:"Upgrade Required",428:"Precondition Required",429:"Too Many Requests",431:"Request Header Fields Too Large",444:"Connection Closed Without Response",451:"Unavailable For Legal Reasons",499:"Client Closed Request",500:"Internal Server Error",501:"Not Implemented",502:"Bad Gateway",503:"Service Unavailable",504:"Gateway Timeout",505:"HTTP Version Not Supported",506:"Variant Also Negotiates",507:"Insufficient Storage",508:"Loop Detected",510:"Not Extended",511:"Network Authentication Required",599:"Network Connect Timeout Error"};
	if (iCode in oCode) return `${iCode} ${oCode[iCode]}`;
	let txtCode = iCode.toString();
	if (txtCode.length == 3 && txtCode.slice(0,1) in oClass) return `${iCode} Unknown ${oClass[parseInt(txtCode.slice(0,1))]} Code`;
	return `${iCode} Unknown Status Code`;
}

// https://stackoverflow.com/questions/30008114/how-do-i-promisify-native-xhr
function newSendXHR(opts) { /* opt = { method:<STRING>, url:<STRING>, headers:<OBJECT>, params:<STRING>|<OBJECT> } */
  log(`XHR call for ${opts.method} ${opts.url}`);
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(opts.method, opts.url);
    xhr.onreadystatechange = function() { /* <-- Added... */
      const arrStates = ["UNSENT","OPENED","HEADERS_RECEIVED","LOADING","DONE"];
      if (typeof DEBUG !== "undefined") console.log(`XHR State: ${arrStates[xhr.readyState]} (${xhr.readyState})`);
    };
    xhr.onload = function () {
      if (this.status == 200) {
        resolve(xhr);
      } else {
        reject(xhr);
      }
    };
    xhr.onerror = function () {
      reject(xhr);
    };
    if (opts.headers) {
      Object.keys(opts.headers).forEach(function (key) {
        xhr.setRequestHeader(key, opts.headers[key]);
      });
    }
    var params = opts.params; /* Stringify params if given an object */
    if (params && typeof params === 'object') {
      params = Object.keys(params).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      }).join('&');
    } else {
      params = encodeURIComponent(params); /* <-- Added... */
    }
    xhr.send(params);
  });
}

function fixMissingData() {
  var oTmp = {};
  Object.keys(oSections).forEach(function(key) {
    if (oSections[key] == "") {
      if (key=="historical") {
        pushObjKeyVal(oTitles,"Historical stats",{title:"Historical Stats",section:key});
      } else if (key.startsWith("tls")) {
        let newTitle = titleCase( key.replace(/_/g," ") ).replace(/\btls\b/ig,"TLS");
        pushObjKeyVal(oTitles,"Platform TLS",{title:newTitle,section:key});
      } else {
        pushObjKeyVal(oTitles,"Unknown",key);
      }
    }
  });
  oTmp = {};
  var arrTmp = Object.keys(oTitles);
  arrTmp.sort();
  arrTmp.forEach(function(key) {
    oTitles[key].sort();
    oTmp[key] = oTitles[key].slice(0);
    arrStructure.push({
      title: key,
      category: key.toLowerCase().replace(/ /g,"_"),
      sections: oTitles[key].slice(0),
    });
  });
  oTitles = Object.assign({}, oTmp);
}

function getSubDoc(oDoc) {
  return new Promise(function (resolve, reject) {
    newSendXHR({
      method: 'GET',
      url: `${DOCS_URL}${oDoc.path}`
    })
    .then(function (xhr) {
      let respText = xhr.responseText.replace(/^[\s\S]*?<ul[^>]+class="nav subnav capture"[^>]*>([\s\S]+?)<\/ul>[\s\S]+$/,"$1");
      respText.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, function(m,g1,g2) {
        g1 = g1.replace(/^#/,"");
        if (typeof DEBUG !== "undefined") console.log(oDoc.title+": "+g1);
        if (g1 in oSections) {
          oSections[g1] = oDoc.title;
          pushObjKeyVal(oTitles,oDoc.title,{title:g2,section:g1});
        }
      } );
      if (++procsRunning==arrDocs.length) resolve();
    })
    .catch(function (xhr) {
      reject(`XHR ERROR - HTTP Status: ${getResponseStatus(xhr.status)}`);
    });
  });
}

function getSubDocs() {
  return new Promise(function (resolve, reject) {
    procsRunning = 0;
    arrDocs.forEach(function(oDoc){
      getSubDoc(oDoc)
      .then(function() {
        resolve();
      })
      .catch(function(msg) {
        reject(msg);
      });
    });
  });
}

function getMainDoc() {
  return new Promise(function (resolve, reject) {
    newSendXHR({
      method: 'GET',
      url: `${DOCS_URL}/api`
    })
    .then(function (xhr) {
      let respText = xhr.responseText.replace(/^[\s\S]*?<ul[^>]+id="api-nav"[^>]*>([\s\S]+?)<\/ul>[\s\S]+$/,"$1");
      respText.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, function(m,g1,g2) {
        arrDocs.push({path:g1,title:g2});
      } );
      if (typeof DEBUG !== "undefined") console.log(JSON.stringify(arrDocs,null,"  "));
      resolve();
    })
    .catch(function (xhr) {
      reject(`XHR ERROR - HTTP Status: ${getResponseStatus(xhr.status)}`);
    });
  });
}

function getApiDocs() {
  return new Promise(function (resolve, reject) {
    newSendXHR({
      method: 'GET',
      url: `${API_URL}/docs`
    })
    .then(function (xhr) {
      try {
        arrApiDocs = JSON.parse(xhr.responseText);
      } catch(err) {
        reject(`Unable to parse XHR response: ${err}`);
      }
      if (typeof DEBUG !== "undefined") console.log(`Sections found in API docs: ${arrApiDocs.length}`);
      arrApiDocs.forEach(function(oSection) {
        arrSections.push(oSection.section);
        oSections[oSection.section] = "";
      });
      resolve();
    })
    .catch(function (xhr) {
      reject(`XHR ERROR - HTTP Status: ${getResponseStatus(xhr.status)}`);
    });
  });
}

function getDocs() {
    return new Promise(function (resolve, reject) {
        getApiDocs() // <-- Step 1
        .then(function() {
            getMainDoc() // <-- Step 2 
            .then(function() {
                getSubDocs() // <-- Step 3
                .then(function() {
                    fixMissingData(); // <-- Step 4
                    resolve("");
                })
                .catch(function(msg) { // <-- Step 3 failed
                    reject(msg);
                });
            })
            .catch(function(msg) { // <-- Step 2 failed
                reject(msg);
            });
        })
        .catch(function(msg) { // <-- Step 1 failed
            reject(msg);
        });
    });
}

log("Starting");
if (typeof window !== 'undefined') {
    getDocs()
    .then(function(x) {
        getElement("output").innerHTML = escapeHTML(JSON.stringify(arrStructure,null,"  "));
        log("Done");
    })
    .catch(function(err) {
        throw new Error(`Error getting API Docs: ${err}`);
    })
}