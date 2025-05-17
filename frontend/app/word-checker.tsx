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

// Belirli bir hücreden başlayarak belirli bir eksende tam kelimeyi bulan yardımcı fonksiyon
function findWordOnAxis(
    startRow: number,
    startCol: number,
    axis: 'horizontal' | 'vertical' | 'diagonal_tlbr',
    tempBoard: BoardState
): FoundWord | null {
    let dr = 0, dc = 0;
    if (axis === 'vertical') dr = 1;
    else if (axis === 'horizontal') dc = 1;
    else { dr = 1; dc = 1; } // diagonal_tlbr

    let r = startRow, c = startCol;
    // Kelimenin başına git
    while (getTileAt(r - dr, c - dc, tempBoard)) { r -= dr; c -= dc; }

    // Baştan sona kelimeyi ve yolu oluştur
    let word = "";
    const path: { row: number; col: number }[] = [];
    while (true) {
        const letter = getTileAt(r, c, tempBoard);
        if (!letter) break;
        word += letter;
        path.push({ row: r, col: c });
        r += dr; c += dc;
    }

    // Sadece yeterince uzunsa kelimeyi döndür
    if (word.length >= MIN_WORD_LENGTH) {
        return { word, path };
    }
    return null;
}

// --- Ana Doğrulama Fonksiyonu ---
export function checkWordPlacement(
    newlyPlacedTiles: NewlyPlacedTile[],
    committedBoardState: BoardState // Oyunun önceki durumu
): PlacementValidationResult {

    // 1. Temel Kontrol
    if (!newlyPlacedTiles || newlyPlacedTiles.length === 0) {
        return { status: ValidationStatus.NoTilesPlaced, message: "Hiç harf yerleştirilmedi." };
    }

    // 2. Eksen ve Tek Sıra Kontrolü (Çapraz Dahil)
    let axis: 'horizontal' | 'vertical' | 'diagonal_tlbr' | 'single';
    if (newlyPlacedTiles.length === 1) {
        axis = 'single';
    } else {
        const sortedTiles = [...newlyPlacedTiles].sort((a, b) => a.row - b.row || a.col - b.col);
        const first = sortedTiles[0];
        const allHorizontal = sortedTiles.every(t => t.row === first.row);
        const allVertical = sortedTiles.every(t => t.col === first.col);
        const allDiagonalTLBR = sortedTiles.every((t, i) => i === 0 || (t.row === sortedTiles[i-1].row + 1 && t.col === sortedTiles[i-1].col + 1));

        if (allHorizontal) axis = 'horizontal';
        else if (allVertical) axis = 'vertical';
        else if (allDiagonalTLBR) axis = 'diagonal_tlbr';
        else return { status: ValidationStatus.InvalidAxis, message: "Harfler tek bir sıra (yatay, dikey veya sol üstten sağ alta çapraz) üzerinde olmalı." };

        // Boşluk Kontrolü
        const tempBoardForGapCheck = {...committedBoardState};
        newlyPlacedTiles.forEach(t => { tempBoardForGapCheck[getBoardKey(t.row, t.col)] = t.letter; });
        for(let i = 1; i < sortedTiles.length; i++) {
            const prev = sortedTiles[i-1]; const curr = sortedTiles[i]; let gapExists = false;
            if (axis === 'horizontal') { for (let c = prev.col + 1; c < curr.col; c++) if (!getTileAt(curr.row, c, tempBoardForGapCheck)) gapExists = true; }
            else if (axis === 'vertical') { for (let r = prev.row + 1; r < curr.row; r++) if (!getTileAt(r, curr.col, tempBoardForGapCheck)) gapExists = true; }
            else { for (let step = 1; prev.row + step < curr.row; step++) if (!getTileAt(prev.row + step, prev.col + step, tempBoardForGapCheck)) gapExists = true; }
            if (gapExists) return { status: ValidationStatus.InvalidPlacement, message: "Harfler arasında boşluk bırakılamaz." };
        }
    }

    // 3. Geçici Tam Tahta (Kelime bulma için kullanılacak)
    const tempBoard: BoardState = { ...committedBoardState };
    newlyPlacedTiles.forEach(tile => { tempBoard[getBoardKey(tile.row, tile.col)] = tile.letter; });

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
        // --- DEĞİŞİKLİK BURADA ---
        // Hata SADECE bağlantı yoksa VE eksen çapraz DEĞİLSE verilir.
        if (!isConnected && axis !== 'diagonal_tlbr') {
            return { status: ValidationStatus.InvalidPlacement, message: "Yeni harfler mevcut harflere bağlanmalı (Yatay/Dikey için)." };
       }
       // Eğer eksen çapraz ise, isConnected false olsa bile devam eder.
       // --- DEĞİŞİKLİK SONU ---
    }

    // 5. Kelime Bulma ve Doğrulama (YENİ YAPI)
    const potentialWords = new Map<string, FoundWord>(); // Tekrarı önlemek için Map<kelime_string, FoundWord>
    let invalidWordFound: string | null = null;

    // Yerleştirilen HER BİR taş için, o taştan geçen YATAY ve DİKEY kelimeleri bul
    for (const tile of newlyPlacedTiles) {
        // Yatay kelimeyi bul
        const hWordInfo = findWordOnAxis(tile.row, tile.col, 'horizontal', tempBoard);
        if (hWordInfo) {
            potentialWords.set(hWordInfo.word, hWordInfo);
        }

        // Dikey kelimeyi bul
        const vWordInfo = findWordOnAxis(tile.row, tile.col, 'vertical', tempBoard);
        if (vWordInfo) {
            potentialWords.set(vWordInfo.word, vWordInfo);
        }
    }

    /*// Çapraz (Cross) Kelimeleri Bul - Yerleştirilen HER taş için H ve V kontrolü
    for (const tile of newlyPlacedTiles) {
        // Yatay kontrol
        const hWordInfo = findWordOnAxis(tile.row, tile.col, 'horizontal', tempBoard);
        if (hWordInfo) potentialWords.set(hWordInfo.word, hWordInfo);

        // Dikey kontrol
        const vWordInfo = findWordOnAxis(tile.row, tile.col, 'vertical', tempBoard);
        if (vWordInfo) potentialWords.set(vWordInfo.word, vWordInfo);
    }*/

    // Hiç kelime bulunamadıysa (min uzunlukta)
    if (potentialWords.size === 0 && newlyPlacedTiles.length > 0) {
        return { status: ValidationStatus.InvalidPlacement, message: "Geçerli bir kelime (min 2 harf) oluşturulamadı." };
    }

    // Bulunan Tüm Benzersiz Kelimeleri Doğrula
    const allValidWordsFound: FoundWord[] = [];
    for (const wordInfo of potentialWords.values()) {
        const lowerCaseWord = wordInfo.word.toLocaleLowerCase('tr-TR');
        console.log(`Validating word: '${wordInfo.word}' (as '${lowerCaseWord}')`);
        if (!turkishWordsSet.has(lowerCaseWord)) {
            console.error(`Invalid word found: ${wordInfo.word}`);
            invalidWordFound = wordInfo.word;
            break; // İlk geçersiz kelimede dur
        }
        allValidWordsFound.push(wordInfo); // Geçerliyse listeye ekle
    }

    // Sonuç
    if (invalidWordFound) {
        return { status: ValidationStatus.InvalidWord, message: `"${invalidWordFound}" geçerli bir kelime değil.`, invalidWord: invalidWordFound };
    }

    // Eğer buraya kadar geldiysek ve en az bir kelime bulunduysa hamle geçerlidir.
     if (allValidWordsFound.length === 0) {
         return { status: ValidationStatus.InvalidPlacement, message: "Geçerli kelime bulunamadı." };
     }

    console.log("All validated words:", allValidWordsFound.map(w=>w.word));
    return {
        status: ValidationStatus.Ok,
        message: "Geçerli hamle.",
        validWords: allValidWordsFound
    };
}

// Eski checkWords fonksiyonu kaldırıldı.