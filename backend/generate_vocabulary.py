import os
import json

# Klasör yolu (klonladığın klasörün tam yolu)
folder_path = './vocabularylist'

all_words = set()

# Bütün .list dosyalarını sırayla oku
for filename in os.listdir(folder_path):
    if filename.endswith('.list'):
        filepath = os.path.join(folder_path, filename)
        with open(filepath, 'r', encoding='utf-8') as file:
            words = file.read().splitlines()
            all_words.update(words)  # tekrar edenleri engellemek için set kullandım

# Listeye çevirip kaydet
all_words_list = list(all_words)

# JSON dosyası olarak kaydet
with open('turkish_words.json', 'w', encoding='utf-8') as json_file:
    json.dump(all_words_list, json_file, ensure_ascii=False, indent=2)

print(f"{len(all_words_list)} kelime başarıyla birleştirildi ve kaydedildi.")
