import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OnboardingScreen = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const router = useRouter();

  useEffect(() => {
      const checkLogin = async () => {
        const storedUserId = await AsyncStorage.getItem('user_id');
        if (storedUserId) {
          router.replace('/home');
        }
      };
      checkLogin();
    }, []);

  const slides = [
    {
      id: 1,
      title: 'Kelime Oyununa Hoş Geldiniz',
      description: 'Eğlenceli ve öğretici kelime oyunumuzla dil becerilerinizi geliştirin.',
    },
    {
      id: 2,
      title: 'Farklı Zorluk Seviyeleri',
      description: 'Seviyenize uygun zorlukta kelimelerle oynayın.',
    },
    {
      id: 3,
      title: 'Arkadaşlarınızla Yarışın',
      description: 'Arkadaşlarınızla yarışın ve en yüksek puanı alın.',
    },
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      router.push('/login');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Kelime Oyunu</Text>
      </View>

      <View style={styles.slide}>
        <Text style={styles.title}>{slides[currentSlide].title}</Text>
        <Text style={styles.description}>{slides[currentSlide].description}</Text>
      </View>
      
      <View style={styles.footer}>
        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.paginationDot,
                currentSlide === index && styles.paginationDotActive,
              ]}
            />
          ))}
        </View>
        
        <TouchableOpacity
          style={[styles.button, isPressed && styles.buttonPressed]}
          onPress={handleNext}
          onPressIn={() => setIsPressed(true)} // Basılma başladığında
          onPressOut={() => setIsPressed(false)} // Basılma bittiğinde
        >
          <Text style={styles.buttonText}>
            {currentSlide === slides.length - 1 ? 'Başla' : 'İleri'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#4CAF50',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 30,
  },
  paginationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 5,
  },
  paginationDotActive: {
    backgroundColor: '#FFC107',
    width: 20,
  },
  button: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonPressed: {
    backgroundColor: '#0056b3', // Basıldığında renk değişimi
  },
});

export default OnboardingScreen; 