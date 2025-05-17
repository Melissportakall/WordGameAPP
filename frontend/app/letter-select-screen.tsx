import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, TouchableWithoutFeedback } from 'react-native';

interface LetterSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLetter: (letter: string) => void;
}

// Türkçe harf seti (ihtiyaca göre genişletilebilir)
const TURKISH_ALPHABET = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split('');

const LetterSelectionModal: React.FC<LetterSelectionModalProps> = ({ visible, onClose, onSelectLetter }) => {
  return (
    <Modal
      transparent={true}
      visible={visible}
      onRequestClose={onClose} // Android geri tuşu için
      animationType="fade"
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose} // Dışarı tıklayınca kapat
      >
        <TouchableWithoutFeedback>
             {/* İçeriğe tıklayınca kapanmasın diye */}
             <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Joker İçin Harf Seç</Text>
            <ScrollView contentContainerStyle={styles.letterContainer}>
              {TURKISH_ALPHABET.map((letter) => (
                <TouchableOpacity
                  key={letter}
                  style={styles.modalLetterButton}
                  onPress={() => onSelectLetter(letter)}
                >
                  <Text style={styles.modalLetterText}>{letter}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>İptal</Text>
            </TouchableOpacity>
            </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
};

// Modal için stiller (isteğe göre özelleştirilebilir)
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Yarı şeffaf arka plan
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '90%', // Genişlik
    maxHeight: '80%', // Yükseklik sınırı
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  letterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap', // Sıra sıra diz, sığmazsa alta geç
    justifyContent: 'center',
  },
  modalLetterButton: {
    backgroundColor: '#4CAF50', // Yeşil buton
    paddingVertical: 10,
    paddingHorizontal: 15,
    margin: 5,
    borderRadius: 8,
    minWidth: 45, // Buton genişliği
    alignItems: 'center',
  },
  modalLetterText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
    closeButton: {
        marginTop: 15,
        padding: 10,
    },
    closeButtonText: {
        color: 'grey',
        fontSize: 16,
    }
});

export default LetterSelectionModal;