//----------------------------------------------
/* Import modules */
const base64 = require('base-64');
const axios = require('axios').default;
const xml2js = require('xml2js');
const yaml = require('js-yaml');

import fs from 'fs';
import { AxiosResponse } from 'axios';


//----------------------------------------------
// set process.env
require('dotenv').config();

const QiitaURL: string = process.env.QiitaURL!;
const HatenaURL: string = process.env.HatenaURL!;

console.log('----------------------------')
console.log('qiita ' + QiitaURL);
console.log('hatena ' + HatenaURL);
console.log('----------------------------')

//----------------------------------------------
/* Type Definisions */

type Qiita = 'Qiita';
type Hatena = 'Hatena';
type TagType = Qiita | Hatena;

interface ArticleInfo {
  url : string;
  title : string;
  tag : TagType;
  date : Date;
}

//----------------------------------------------
/* Helper Functions */

const getJSON = (url: string): Promise<any> => new Promise((resolve, reject) => {
  axios.get(url)
    .then((res: AxiosResponse) => {
      if (res.status < 300) {
        resolve(res.data);
      }
      throw new Error();
    })
    .catch((res: AxiosResponse) => reject(res));
});

const getJSONWithAuth = (url: string, username: string, apikey: string): Promise<any> => new Promise((resolve, reject) => {
  return axios.get(
    url,
    {
      auth: {
        username: username,
        password: apikey,
      }
    }
  )
  .then((res: AxiosResponse) => {
    if (res.status < 300) {
      resolve(res.data);
    }
    throw new Error();
  })
  .catch((res: AxiosResponse) => {
    reject(res);
  });
});

//----------------------------------------------
/* Qiita */

async function getQiitaAritcle(): Promise<ArticleInfo[]> {
  const data: any = await getJSON(QiitaURL);
  return extractQiitaInfo(data);
}

function extractQiitaInfo(data: any[]): ArticleInfo[] {
  return data.map(
    val => ({
      url: val.url,
      title: val.title,
      tag: 'Qiita',
      date: new Date(val.updated_at),
    })
  );
}

//----------------------------------------------
/* hatena blog */

const getHatenaArticle = async (): Promise<ArticleInfo[]> => {
  const username = process.env.HatenaUsername!;
  const apikey = process.env.HatenaApiKey!;

  let articles: ArticleInfo[] = [];
  let nextLink = HatenaURL;
  while (nextLink !== undefined) {
    const data = await getJSONWithAuth(nextLink, username, apikey);
    const el = await extractHatenaBlogInfo(data);
    nextLink = el.nextLink;
    articles.push(...el.articles);
  }

  return new Promise(resolve => resolve(articles));
}

type HatenaArticleType = {articles: ArticleInfo[], nextLink: string};

const extractHatenaBlogInfo = (data: any[]): Promise<HatenaArticleType> => new Promise((resolve, reject) => {
  const parser = new xml2js.Parser();
  parser.parseStringPromise(data)
    .then((xml: any) => {
      const nextLink = getHatenaNextLink(getLinkFromXml(xml));
      const articles = getEntriesFromXml(xml)
        .map(entry => getHatenaEntry(entry));
      resolve({articles: articles, nextLink: nextLink});
    })
    .catch((val: Error) => {
      console.log(val);
      reject('error');
    });
});

const getLinkFromXml = (xml: any): any => {
  return xml.feed.link;
}

const getEntriesFromXml = (xml: any): any[] => {
  return xml.feed.entry;
}

const getHatenaEntry = (entry: any): ArticleInfo => {
  // console.log(entry);
  return {
    url: getHatenaArticleLink(entry.link),
    title: entry.title,
    tag: 'Hatena',
    date: new Date(entry.published),
  };
};

const getHatenaArticleLink = (link: any[]): string => {
  // console.log(link);
  const url = link
    .filter(elem => elem.$.rel === 'alternate')
    .map(elem => elem.$.href);

  return url[0];
}

const getHatenaNextLink = (link: any[]): string => {
  const nextLink = link
    .filter(elem => elem.$.rel === 'next')
    .map(elem => {
      // console.log(elem);
      return elem.$.href;
    });

  return nextLink[0];
}

//----------------------------------------------
/* article Factory */

interface zzZArticle {
  author: string;
  title: string;
  date: string; // ISO8601
  description: string;
  draft: boolean;
  hideToc: boolean;
  enableToc: boolean;
  enableTocContent: boolean;
  tags: string[]
}

const toISO8601StringByUTC9 = (date: Date): string => {
  const dateStr = date.toISOString();
  return dateStr.split('.')[0] + '+09:00';
}

const artilceFactory = (articles: ArticleInfo[]): void => {
  const pathOrg = '../../content/ja/posts/';
  articles.forEach(val => createArticleFile(val, pathOrg));
};

const createArticleFile = (article: ArticleInfo, pathOrg: string): void => {
  const filename = article.date.getTime() + '.md';
  const filepath = pathOrg + filename;
  const toc = articleTocFactory(article).toString();
  const body = articleBody(toc, article);
  // console.log(body);

  if (fs.existsSync(filepath)) {
    return;
  }

  fs.writeFile(pathOrg + filename, body, (err) => {
    if (err) throw err;
    console.log(article.title + ' を作成しました。\n');
  });
}

const articleTocFactory = (article: ArticleInfo): Object => {
  const toc = {
    author: 'seriru',
    title: `${article.title}`,
    date: article.date,//toISO8601StringByUTC9(article.date), // ISO8601
    description: '',
    draft: false,
    hideToc: false,
    enableToc: true,
    enableTocContent: false,
    tags: [article.tag],
  }

  const tocStr: string = '---\n' + yaml.dump(toc) + '---\n';
  return tocStr;
}

const articleBody = (toc: string, article: ArticleInfo): string => {
  const body = '\n記事はこちら（タグが付いているリンク先に飛びます）\n' + article.url + '\n';
  return toc + body;
}

//----------------------------------------------

const run = async () => {
  let allArticles: ArticleInfo[] = [];
  console.log('run');  
  const qiitaArticles = await getQiitaAritcle();
  allArticles.push(...qiitaArticles);
  console.log('parse QiitaData finish');
  const hatenaArticles = await getHatenaArticle();
  allArticles.push(...hatenaArticles);
  console.log('parse HatenaBlog finish');

  // 降順ソート
  allArticles.sort((l, r) => {
    if (l.date < r.date) return 1;
    else if (l.date > r.date) return -1;
    else return 0;
  });

  artilceFactory(allArticles);
}

run();