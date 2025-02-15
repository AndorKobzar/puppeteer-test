/*
Пример использования:
node puppeteer.js https://www.vprok.ru/product/domik-v-derevne-dom-v-der-moloko-ster-3-2-950g--309202 "Санкт-Петербург и область"
*/

import puppeteer from 'puppeteer';
const url = new URL(process.argv?.[2]);
const region = process.argv?.[3];
import fs from 'fs';

// Для удобства отладки старые файлы удаляем
if (fs.existsSync('product.txt'))
    fs.unlinkSync('product.txt');
if (fs.existsSync('screenshot.jpg'))
    fs.unlinkSync('screenshot.jpg');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--window-size=1366,768'],
        // Отладка в браузере
        slowMo: 500,
        devtools: true,
        executablePath: '/usr/bin/google-chrome' // настройка под мою среду исполнения (linux)
    });

    console.log('Начало парсинга');

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto(url, { waitUntil: 'load' });

    console.log('Загружаем страницу');

    // waitForSelector здесь работает ненадежно из-за мутаций
    await page.waitForFunction(
        () => document.querySelector('[class^="UiHeaderHorizontalBase_firstRow"]'),
        { timeout: 6e4 }
    );

    console.log('Устанавливаем регион');

    await page.evaluate((region) => {
        // Соглашаемся с куками, чтобы закрыть панель
        document.querySelector('[class*="CookiesAlert_agreeButton"] [type="button"]')?.click();

        // Открываем выбор региона
        if (region) document.querySelector('[class^="Region_regionIcon"]').click();
    }, region);

    // Ожидаем поп-ап с регионами
    await page.waitForFunction(
        () => document.querySelector('[class^="UiRegionListBase_item___"]'),
        { timeout: 6e4 }
    );

    // Выбираем регион
    await page.evaluate((region) => {
        const elements = [...document.querySelectorAll('[class^="UiRegionListBase_item___"]')];
        const target = elements.find(el => el.textContent.trim() === region);
        if (target) target.click();
    }, region);


    await page.waitForFunction((region) => {
        const settedRegion = document.querySelector('[class^="Region_region__"] span:last-of-type');
        return settedRegion && settedRegion.textContent.trim() === region;
    }, { timeout: 6e4 }, region);

    await page.evaluate(() => {
        // Чтобы при скролле тулбар оставался вверху, а не перекрывал контент (для скриншота)
        const toolbar = document.querySelector('[class*=UiHeaderHorizontalBase_firstRow]');
        if (toolbar) {
            toolbar.style.position = 'static';
        }

        // Закрываем поп-ап с предложением войти
        const popUp = document.querySelector('[class^="Tooltip_closeIcon"]');
        if (popUp) {
            popUp.click();
        }
    });

    console.log('Скроллим вниз');

    autoScrollUntilFooter(page);
    await page.waitForSelector('[class*="UiFooterBottomBase_logo"]', { visible: true, timeout: 6e4 });

    console.log('Делаем скриншот');
    
    await page.screenshot({ path: 'screenshot.jpg', fullPage: true });

    const data = await page.evaluate(() => {
        const scriptElement = document.getElementById('__NEXT_DATA__');
        const data = scriptElement ? JSON.parse(scriptElement.innerText) : null;
        return data?.props?.pageProps?.initialStore?.productPage;
    });

    // price есть всегда, поэтому не ставим условие
    let product = `price=${data.product.price}\n`;
    if (data.product?.oldPrice)
        product += `priceOld=${data.product?.oldPrice}\n`;
    if (data?.owox?.reviewsRating)
        product += `rating=${data?.owox?.reviewsRating}\n`;
    if (data?.owox?.reviewsCount)
        product += `reviewCount=${data?.owox?.reviewsCount}\n`;

    console.log('Сохраняем данные');

    fs.writeFileSync('product.txt', product);
    await browser.close();
})();

// Хелпер
async function autoScrollUntilFooter(page) {
    let footerExists = false;

    do {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(resolve => setTimeout(resolve, 500));
        footerExists = await page.evaluate(() => !!document.querySelector('[class*="UiFooterBottomBase_logo"]'));
    } while (!footerExists);
}


