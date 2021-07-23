"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//----------------------------------------------
/* Import modules */
const base64 = require('base-64');
const axios = require('axios').default;
const xml2js = require('xml2js');
const yaml = require('js-yaml');
const fs_1 = __importDefault(require("fs"));
//----------------------------------------------
// set process.env
require('dotenv').config();
const QiitaURL = process.env.QiitaURL;
const HatenaURL = process.env.HatenaURL;
console.log('----------------------------');
console.log('qiita ' + QiitaURL);
console.log('hatena ' + HatenaURL);
console.log('----------------------------');
//----------------------------------------------
/* Helper Functions */
const getJSON = (url) => new Promise((resolve, reject) => {
    axios.get(url)
        .then((res) => {
        if (res.status < 300) {
            resolve(res.data);
        }
        throw new Error();
    })
        .catch((res) => reject(res));
});
const getJSONWithAuth = (url, username, apikey) => new Promise((resolve, reject) => {
    return axios.get(url, {
        auth: {
            username: username,
            password: apikey,
        }
    })
        .then((res) => {
        if (res.status < 300) {
            resolve(res.data);
        }
        throw new Error();
    })
        .catch((res) => {
        reject(res);
    });
});
//----------------------------------------------
/* Qiita */
function getQiitaAritcle() {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield getJSON(QiitaURL);
        return extractQiitaInfo(data);
    });
}
function extractQiitaInfo(data) {
    return data.map(val => ({
        url: val.url,
        title: val.title,
        tag: 'Qiita',
        date: new Date(val.updated_at),
    }));
}
//----------------------------------------------
/* hatena blog */
const getHatenaArticle = () => __awaiter(void 0, void 0, void 0, function* () {
    const username = process.env.HatenaUsername;
    const apikey = process.env.HatenaApiKey;
    let articles = [];
    let nextLink = HatenaURL;
    while (nextLink !== undefined) {
        const data = yield getJSONWithAuth(nextLink, username, apikey);
        const el = yield extractHatenaBlogInfo(data);
        nextLink = el.nextLink;
        articles.push(...el.articles);
    }
    return new Promise(resolve => resolve(articles));
});
const extractHatenaBlogInfo = (data) => new Promise((resolve, reject) => {
    const parser = new xml2js.Parser();
    parser.parseStringPromise(data)
        .then((xml) => {
        const nextLink = getHatenaNextLink(getLinkFromXml(xml));
        const articles = getEntriesFromXml(xml)
            .map(entry => getHatenaEntry(entry));
        resolve({ articles: articles, nextLink: nextLink });
    })
        .catch((val) => {
        console.log(val);
        reject('error');
    });
});
const getLinkFromXml = (xml) => {
    return xml.feed.link;
};
const getEntriesFromXml = (xml) => {
    return xml.feed.entry;
};
const getHatenaEntry = (entry) => {
    // console.log(entry);
    return {
        url: getHatenaArticleLink(entry.link),
        title: entry.title,
        tag: 'Hatena',
        date: new Date(entry.published),
    };
};
const getHatenaArticleLink = (link) => {
    // console.log(link);
    const url = link
        .filter(elem => elem.$.rel === 'alternate')
        .map(elem => elem.$.href);
    return url[0];
};
const getHatenaNextLink = (link) => {
    const nextLink = link
        .filter(elem => elem.$.rel === 'next')
        .map(elem => {
        // console.log(elem);
        return elem.$.href;
    });
    return nextLink[0];
};
const toISO8601StringByUTC9 = (date) => {
    const dateStr = date.toISOString();
    return dateStr.split('.')[0] + '+09:00';
};
const artilceFactory = (articles) => {
    const pathOrg = '../../content/ja/posts/';
    articles.forEach(val => createArticleFile(val, pathOrg));
};
const createArticleFile = (article, pathOrg) => {
    const filename = article.date.getTime() + '.md';
    const filepath = pathOrg + filename;
    const toc = articleTocFactory(article).toString();
    const body = articleBody(toc, article);
    // console.log(body);
    if (fs_1.default.existsSync(filepath)) {
        return;
    }
    fs_1.default.writeFile(pathOrg + filename, body, (err) => {
        if (err)
            throw err;
        console.log(article.title + ' を作成しました。\n');
    });
};
const articleTocFactory = (article) => {
    const toc = {
        author: 'seriru',
        title: `${article.title}`,
        date: article.date,
        description: '',
        draft: false,
        hideToc: false,
        enableToc: true,
        enableTocContent: false,
        tags: [article.tag],
    };
    const tocStr = '---\n' + yaml.dump(toc) + '---\n';
    return tocStr;
};
const articleBody = (toc, article) => {
    const body = '\n記事はこちら（タグが付いているリンク先に飛びます）\n' + article.url + '\n';
    return toc + body;
};
//----------------------------------------------
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    let allArticles = [];
    console.log('run');
    const qiitaArticles = yield getQiitaAritcle();
    allArticles.push(...qiitaArticles);
    console.log('parse QiitaData finish');
    const hatenaArticles = yield getHatenaArticle();
    allArticles.push(...hatenaArticles);
    console.log('parse HatenaBlog finish');
    // 降順ソート
    allArticles.sort((l, r) => {
        if (l.date < r.date)
            return 1;
        else if (l.date > r.date)
            return -1;
        else
            return 0;
    });
    artilceFactory(allArticles);
});
run();
