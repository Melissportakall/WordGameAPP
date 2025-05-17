// word-checker.tsx

// Kelime setini oluştur (Dosya yolunu kontrol et)
import { turkishWords } from '../assets/turkish_words.js';
const turkishWordsSet = new Set(turkishWords.map(word => word.toLocaleLowerCase('tr-TR')));

// --- Constants ---
const BOARD_SIZE = 15;
const CENTER_ROW = 7;
const CENTER_COL = 7;
const MIN_WORD_LENGTH = 2;

// --- Type Definitions ---

// Kalıcı tahta durumu
export interface BoardState {
  [key: string]: string; // key: "row_col"
}

// Yeni yerleştirilen taş
export interface NewlyPlacedTile {
    letter: string;
    row: number;
    col: number;
    isBlank?: boolean;
    id?: string; // Opsiyonel ID
}

// Bulunan kelime ve yolu
export interface FoundWord {
    word: string;
    path: { row: number; col: number }[]; // Nesne dizisi olarak değiştirdim, kullanımı daha kolay olabilir
}

// Doğrulama durumu enum'u
export enum ValidationStatus {
    Ok = 'Ok',
    InvalidWord = 'InvalidWord',
    InvalidPlacement = 'InvalidPlacement',
    InvalidAxis = 'InvalidAxis',
    NoTilesPlaced = 'NoTilesPlaced',
}

// Doğrulama sonucu interface'i
export interface PlacementValidationResult {
    status: ValidationStatus;
    message: string;
    validWords?: FoundWord[];
    invalidWord?: string;
}

// --- Helper Functions ---
const getBoardKey = (row: number, col: number): string => `${row}_${col}`;

function getTileAt(
    row: number,
    col: number,
    tempBoard: { [key: string]: string } // Birleştirilmiş tahtayı kullan
): string | null {
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
        return null;
    }
    return tempBoard[getBoardKey(row, col)] || null;
}

// --- Main Validation Function ---
export function checkWordPlacement(
    newlyPlacedTiles: NewlyPlacedTile[],
    committedBoardState: BoardState
): PlacementValidationResult {

    // 1. Temel Kontroller
    if (!newlyPlacedTiles || newlyPlacedTiles.length === 0) {
        return { status: ValidationStatus.NoTilesPlaced, message: "Hiç harf yerleştirilmedi." };
    }

    // 2. Eksen ve Tek Sıra Kontrolü (Çapraz dahil)
    let axis: 'horizontal' | 'vertical' | 'diagonal_tlbr' | 'single'; // diagonal_tlbr: top-left to bottom-right
    if (newlyPlacedTiles.length === 1) {
        axis = 'single';
    } else {
        // Önce satır/sütuna göre sırala (ekseni belirlemek için)
        const sortedTiles = [...newlyPlacedTiles].sort((a, b) => a.row - b.row || a.col - b.col);
        const first = sortedTiles[0];
        const last = sortedTiles[sortedTiles.length - 1];

        const allHorizontal = sortedTiles.every(t => t.row === first.row);
        const allVertical = sortedTiles.every(t => t.col === first.col);
        // Soldan sağa alta çapraz kontrolü: Her sonraki harfin satırı ve sütunu bir öncekinden 1 fazla mı?
        const allDiagonalTLBR = sortedTiles.every((t, i) => i === 0 || (t.row === sortedTiles[i-1].row + 1 && t.col === sortedTiles[i-1].col + 1));

        if (allHorizontal) axis = 'horizontal';
        else if (allVertical) axis = 'vertical';
        else if (allDiagonalTLBR) axis = 'diagonal_tlbr'; // Geçerli çaprazı ata
        else {
             // Geçerli eksenlerden hiçbiri değilse hata
             return { status: ValidationStatus.InvalidAxis, message: "Harfler tek bir sıra (yatay, dikey veya sol üstten sağ alta çapraz) üzerinde olmalı." };
         }

        // Ek kontrol: Sıralı mı? (Arada boşluk var mı?) - Çapraz için de uyarla
        const tempBoard = {...committedBoardState}; // Geçici tahta oluştur (kontroller için)
        newlyPlacedTiles.forEach(t => { tempBoard[getBoardKey(t.row, t.col)] = t.letter; });

        for(let i = 1; i < sortedTiles.length; i++) {
            const prev = sortedTiles[i-1];
            const curr = sortedTiles[i];
            let gapExists = false;
            if (axis === 'horizontal') {
                for (let c = prev.col + 1; c < curr.col; c++) if (!getTileAt(curr.row, c, tempBoard)) gapExists = true;
            } else if (axis === 'vertical') {
                 for (let r = prev.row + 1; r < curr.row; r++) if (!getTileAt(r, curr.col, tempBoard)) gapExists = true;
            } else { // axis === 'diagonal_tlbr'
                 for (let step = 1; prev.row + step < curr.row; step++) if (!getTileAt(prev.row + step, prev.col + step, tempBoard)) gapExists = true;
            }
            if (gapExists) {
                 return { status: ValidationStatus.InvalidPlacement, message: "Harfler arasında boşluk bırakılamaz." };
            }
        }
    }


    // 3. Geçici Tam Tahta Oluşturma
    const tempBoard: BoardState = { ...committedBoardState };
    newlyPlacedTiles.forEach(tile => {
        tempBoard[getBoardKey(tile.row, tile.col)] = tile.letter;
    });

    // --- DÜZELTİLMİŞ DEBUG LOGU ---
    if (newlyPlacedTiles.length > 0) { // En az bir taş varsa
        const firstTile = newlyPlacedTiles[0];
        const keyLeft = getBoardKey(firstTile.row, firstTile.col - 1);
        const keyCurrent = getBoardKey(firstTile.row, firstTile.col);
        const keyRight = getBoardKey(firstTile.row, firstTile.col + 1);
        console.log(
            `Temp Board Snippet (around ${firstTile.row},${firstTile.col}): ` +
            `Left='${tempBoard[keyLeft] || '.'}' ` +
            `Current='${tempBoard[keyCurrent] || '.'}' ` +
            `Right='${tempBoard[keyRight] || '.'}'`
        );
        console.log("Word Set Size:", turkishWordsSet.size);
        console.log("Set 'et' içeriyor mu?", turkishWordsSet.has("et")); // Eğer küçük harf kullanıyorsan
        console.log("Set 'ET' içeriyor mu?", turkishWordsSet.has("ET")); // Eğer büyük harf kullanıyorsan
    }
    // --- DEBUG LOGU SONU ---


    // 4. Yerleştirme Kuralları (Bağlantı / Merkez)
    const isBoardEmpty = Object.keys(committedBoardState).length === 0;
    let isConnected = false;
    let usesCenter = newlyPlacedTiles.some(t => t.row === CENTER_ROW && t.col === CENTER_COL);

    if (isBoardEmpty && !usesCenter) {
        return { status: ValidationStatus.InvalidPlacement, message: "İlk hamle merkez (★) karesini kullanmalı." };
    }
    if (!isBoardEmpty) {
        isConnected = newlyPlacedTiles.some(tile => {
            const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            return neighbors.some(([dr, dc]) => !!committedBoardState[getBoardKey(tile.row + dr, tile.col + dc)]);
        });
        if (!isConnected) {
             return { status: ValidationStatus.InvalidPlacement, message: "Yeni harfler mevcut harflere bağlanmalı." };
        }
    }

    // 5. Kelime Bulma ve Doğrulama
    const allWordsFound: FoundWord[] = [];
    const wordsToCheck = new Set<string>();
    let invalidWordFound: string | null = null;

    const checkAndAddWord = (word: string, path: { row: number; col: number }[]) => {
        if (invalidWordFound) return;
        if (word.length >= MIN_WORD_LENGTH) {
            const lowerCaseWord = word.toLocaleLowerCase('tr-TR');
            console.log(`Checking word: '${word}'`);

            if (!wordsToCheck.has(lowerCaseWord)) {
               const isInDictionary = turkishWordsSet.has(lowerCaseWord);
               console.log(`'${lowerCaseWord}' in dictionary? ${isInDictionary}`);
   
               if (!isInDictionary) {
                   console.error(`Geçersiz kelime bulundu: ${word}`);
                   invalidWordFound = word;
               } else {
                    allWordsFound.push({ word, path }); // Orijinal kelimeyi ekle
                    wordsToCheck.add(lowerCaseWord); // Kontrol edilen küçük harfi ekle
               }
            }
        } else if (word.length === 1 && newlyPlacedTiles.length === 1 && !isBoardEmpty) {
            // Tek harf konuldu ve tek harflik dizi oluştu (bağlantı kontrolü yapıldı)
            // Bu durumda çapraz kelime oluşmalı, eğer oluşmazsa bu bir hatadır.
            // Şimdilik tek harfi geçersiz saymıyoruz, çapraz kelime kontrolü sonucu belirleyecek.
        }
    };

    // Ana kelimeyi bul (Yatay veya Dikey)
    const primaryAxisCheck = (checkAxis: 'horizontal' | 'vertical') => {
        const startTile = newlyPlacedTiles[0]; // Eksen belli olduğu için herhangi birinden başlayabiliriz
        const r = startTile.row;
        const c = startTile.col;
        const dr = checkAxis === 'vertical' ? 1 : 0;
        const dc = checkAxis === 'horizontal' ? 1 : 0;

        let currentR = r, currentC = c;
        // Geriye doğru git
        while (getTileAt(currentR - dr, currentC - dc, tempBoard)) { currentR -= dr; currentC -= dc; }
        // İleriye doğru kelimeyi ve yolu oluştur
        let word = ""; const path: { row: number; col: number }[] = [];
        while (true) {
            const letter = getTileAt(currentR, currentC, tempBoard);
            if (!letter) break;
            word += letter; path.push({ row: currentR, col: currentC }); currentR += dr; currentC += dc;
        }
        console.log(`Primary axis check (${checkAxis}) found potential word: '${word}'`); // DEBUG
        checkAndAddWord(word, path);
    };

    if (axis === 'horizontal' || axis === 'single') primaryAxisCheck('horizontal');
    if (invalidWordFound) return { status: ValidationStatus.InvalidWord, message: `"${invalidWordFound}" geçerli bir kelime değil.`, invalidWord: invalidWordFound };
    if (axis === 'vertical' || axis === 'single') primaryAxisCheck('vertical');
    if (invalidWordFound) return { status: ValidationStatus.InvalidWord, message: `"${invalidWordFound}" geçerli bir kelime değil.`, invalidWord: invalidWordFound };


    // Çapraz (Cross) Kelimeleri Bul
    if (axis !== 'single' || allWordsFound.length === 0) { // Tek harf konulduysa veya ana eksende kelime oluşmadıysa çaprazlar kontrol edilmeli
        for (const tile of newlyPlacedTiles) {
            const crossAxisCheck = (checkAxis: 'horizontal' | 'vertical') => {
                 const r = tile.row;
                 const c = tile.col;
                 const dr = checkAxis === 'vertical' ? 1 : 0;
                 const dc = checkAxis === 'horizontal' ? 1 : 0;
                 let currentR = r, currentC = c;
                 while (getTileAt(currentR - dr, currentC - dc, tempBoard)) { currentR -= dr; currentC -= dc; }
                 let word = ""; const path: { row: number; col: number }[] = [];
                 while (true) { const letter = getTileAt(currentR, currentC, tempBoard); if (!letter) break; word += letter; path.push({ row: currentR, col: currentC }); currentR += dr; currentC += dc; }
                 console.log(`Cross axis check (${checkAxis}) for tile at ${tile.row},${tile.col} found potential word: '${word}'`); // DEBUG
                 checkAndAddWord(word, path);
             };

             if (axis === 'horizontal') crossAxisCheck('vertical'); // Ana eksen yataysa dikey çapraza bak
             if (invalidWordFound) break; // Geçersiz kelime bulunduysa diğer taşlara bakma
             if (axis === 'vertical') crossAxisCheck('horizontal'); // Ana eksen dikeyse yatay çapraza bak
             if (invalidWordFound) break;
             // Eğer tek harf konulduysa her iki yöne de bakılır
             if (axis === 'single') {
                 crossAxisCheck('horizontal');
                 if (invalidWordFound) break;
                 crossAxisCheck('vertical');
                 if (invalidWordFound) break;
             }
        }
    }
     if (invalidWordFound) return { status: ValidationStatus.InvalidWord, message: `"${invalidWordFound}" geçerli bir kelime değil.`, invalidWord: invalidWordFound };

    // 6. Sonuç Kontrolü
    if (allWordsFound.length === 0) {
        // Bu noktaya geldiyse ve hala kelime yoksa (örn: tek harf konuldu ve bağlanmadı/kelime oluşturmadı)
        return { status: ValidationStatus.InvalidPlacement, message: "Geçerli bir kelime oluşturulamadı veya bağlantı kurulamadı." };
    }

    // Tüm kontrollerden geçti
    return {
        status: ValidationStatus.Ok,
        message: "Geçerli hamle.",
        validWords: allWordsFound
    };
}

// Eski checkWords fonksiyonu kaldırıldı.