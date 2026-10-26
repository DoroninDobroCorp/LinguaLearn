// Read-only acceptance of the published build in the actual target profile.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
const dir='/srv/LinguaLearn/backups/books-2026-10-25';
const db=new Database('/srv/LinguaLearn/spanish/server/spanish_learning.db',{readonly:true});
const counts=()=>Object.fromEntries(['book_answers','book_conversations','book_runs','book_lesson_state'].map(t=>[t,db.prepare(`SELECT count(*) n FROM ${t} WHERE ${t==='book_answers'?'run_id IN (SELECT id FROM book_runs WHERE profile_id=10)':'profile_id=10'}`).get().n]));
const before=counts();const browser=await chromium.launch({headless:true,executablePath:'/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'});const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Argentina/Salta',locale:'ru-RU'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base='https://145.239.82.124.sslip.io/spanish';const checks=[];
try{
 const html=await page.goto(base+'/books?student=10');assert.equal(html.status(),200);await page.getByRole('heading',{name:'Мои книги',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Продолжить книгу',exact:true}).count(),2);assert.match(await page.locator('body').innerText(),/Наталия, ты можешь попросить любые изменения/);assert.match(await page.locator('body').innerText(),/Пройдено 0 из 24/);assert.match(await page.locator('body').innerText(),/Пройдено 0 из 126/);checks.push('Actual HTTPS build, Nataliia, both routes, reminder, untouched progress');await page.waitForTimeout(350);await page.screenshot({path:dir+'/production-books-mobile.png',fullPage:false});
 await page.getByRole('link',{name:'Оглавление',exact:true}).nth(1).click();await page.getByRole('heading',{name:'Gramática de uso del español',exact:true}).waitFor();assert.equal(await page.locator('a[href*="/books/lesson/grammar-"]').count(),126);await page.locator('a[href$="/books/lesson/grammar-125"]').click();await page.getByAltText('Оригинальная страница PDF 262').waitFor();await page.waitForFunction(()=>document.querySelector('img[alt="Оригинальная страница PDF 262"]')?.naturalWidth>0);checks.push('Full grammar outline and authenticated original page in target profile');
 await page.goto(base+'/books?student=10');await page.getByRole('heading',{name:'Мои книги',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'Мои книги',exact:true}).waitFor();checks.push('Published service worker reload');
 const data=await (await page.request.get(base+'/api/books/?profileId=10')).json();assert.deepEqual(data.books.map(b=>[b.total,b.completed,b.mastered]),[[24,0,0],[126,0,0]]);assert.equal((await page.request.get(base+'/api/books/gramatica/pages/139?profileId=1')).status(),403);assert.deepEqual(errors,[]);checks.push('Runtime progress, other-profile denial, no JS errors');
 const after=counts();assert.deepEqual(after,before);assert.equal(before.book_answers,0);checks.push('Read-only production check created no learning records');
 const result={passed:true,checks,before,after,errors,bundle:await page.locator('script[type="module"]').getAttribute('src')};fs.writeFileSync(dir+'/production-acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await page.screenshot({path:dir+'/production-failure.png',fullPage:true}).catch(()=>{});console.error(e);process.exitCode=1;}finally{await browser.close();db.close();}
