import React, { useState } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { collection, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, ALUNO_ID } from '../firebase/config';

type PrioridadeSla = 'urgente' | 'normal' | 'baixa';

const SLA_OPCOES: Record<
  PrioridadeSla,
  { label: string; detalhe: string; duracaoMs: number; antecedenciaMs: number }
> = {
  urgente: {
    label: 'Urgente',
    detalhe: 'SLA 2 min (aviso 1 min antes)',
    duracaoMs: 2 * 60 * 1000,
    antecedenciaMs: 60 * 1000,
  },
  normal: {
    label: 'Normal',
    detalhe: 'SLA 1h (aviso 15 min antes)',
    duracaoMs: 60 * 60 * 1000,
    antecedenciaMs: 15 * 60 * 1000,
  },
  baixa: {
    label: 'Baixa',
    detalhe: 'SLA 4h (aviso 30 min antes)',
    duracaoMs: 4 * 60 * 60 * 1000,
    antecedenciaMs: 30 * 60 * 1000,
  },
};

export default function NewCallScreen({ navigation }: any) {
  // Estados
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [prioridade, setPrioridade] = useState<PrioridadeSla>('normal');
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [saving, setSaving] = useState(false);

  // Tirar foto com a câmera
  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permissão negada', 'Precisamos da câmera para o chamado.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  // Escolher foto da galeria
  async function handlePickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permissão negada', 'Precisamos acessar suas fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  // Obter localização GPS
  async function handleGetLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permissão negada', 'Precisamos da localização para o check-in.');
      return;
    }

    setLoadingLocation(true);

    try {
      const gpsAtivo = await Location.hasServicesEnabledAsync();
      if (!gpsAtivo) {
        Alert.alert('GPS desligado', 'Ative a localização do aparelho e tente novamente.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [local] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      if (local) {
        const enderecoFormatado = `${local.street ?? 'Endereço não identificado'}, ${local.city ?? ''} - ${local.region ?? ''}`;
        setAddress(enderecoFormatado);
      } else {
        setAddress('Endereço não encontrado para esta coordenada.');
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível obter a localização. Tente novamente.');
    } finally {
      setLoadingLocation(false);
    }
  }

  // Agenda notificação local para avisar quando o prazo de SLA estiver se esgotando
  async function agendarNotificacaoSla(
    chamadoId: string,
    descricao: string,
    slaPrazoMs: number,
    antecedenciaMs: number
  ): Promise<string | null> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return null;
      }

      const segundosAteAviso = Math.max(
        5,
        Math.round((slaPrazoMs - antecedenciaMs - Date.now()) / 1000)
      );

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Prazo de SLA se esgotando!',
          body: `O chamado "${descricao.trim()}" está próximo do vencimento.`,
          data: { chamadoId },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: segundosAteAviso,
          repeats: false,
          channelId: 'sla-alerts',
        },
      });

      return notificationId;
    } catch (error) {
      console.log('Erro ao agendar notificação de SLA:', error);
      return null;
    }
  }

  // Salvar no Firestore e navegar de volta
  async function handleCreateCall() {
    setSaving(true);

    try {
      const slaConfig = SLA_OPCOES[prioridade];
      const slaPrazo = Date.now() + slaConfig.duracaoMs;

      const docRef = await addDoc(collection(db, 'alunos', ALUNO_ID, 'chamados'), {
        description,
        photoUri,
        address,
        status: 'aberto',
        prioridade,
        slaPrazo,
        criadoEm: serverTimestamp(),
      });

      const notificationId = await agendarNotificacaoSla(
        docRef.id,
        description,
        slaPrazo,
        slaConfig.antecedenciaMs
      );

      if (notificationId) {
        await updateDoc(docRef, { notificationId });
      }

      Alert.alert(
        'Sucesso',
        notificationId
          ? `Chamado registrado! Você será notificado antes do vencimento (${slaConfig.detalhe}).`
          : 'Chamado registrado!'
      );
      setDescription('');
      setPhotoUri(null);
      setAddress(null);
      setPrioridade('normal');
      navigation.navigate('CallList');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar o chamado. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Novo Chamado</Text>
      
      <Text style={styles.label}>Descrição do problema</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex.: Notebook não liga..."
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>Foto do equipamento</Text>
      {photoUri ? (
        <View>
          <Image source={{ uri: photoUri }} style={styles.photo} />
          <TouchableOpacity onPress={() => setPhotoUri(null)} style={styles.removeButton}>
            <Text style={styles.removeButtonText}>Remover foto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Nenhuma foto anexada</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.cameraButton]} onPress={handleTakePhoto}>
          <Text style={styles.buttonText}>Câmera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.galleryButton]} onPress={handlePickFromGallery}>
          <Text style={styles.buttonText}>Galeria</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Prioridade / Prazo de Atendimento (SLA)</Text>
      <View style={styles.slaRow}>
        {(Object.keys(SLA_OPCOES) as PrioridadeSla[]).map((key) => {
          const selecionado = prioridade === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.slaOption, selecionado && styles.slaOptionSelected]}
              onPress={() => setPrioridade(key)}
            >
              <Text style={[styles.slaOptionTitle, selecionado && styles.slaOptionTitleSelected]}>
                {SLA_OPCOES[key].label}
              </Text>
              <Text style={[styles.slaOptionDetail, selecionado && styles.slaOptionDetailSelected]}>
                {SLA_OPCOES[key].detalhe}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.button, styles.confirmButton, (!description || saving) && styles.disabledButton]}
        disabled={!description || saving}
        onPress={handleCreateCall}
      >
        <Text style={styles.buttonText}>{saving ? 'Salvando...' : 'Criar Chamado'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#fff', padding: 12, minHeight: 80, textAlignVertical: 'top' },
  placeholder: { height: 160, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', borderStyle: 'dashed', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#999' },
  photo: { width: '100%', height: 200, borderRadius: 8 },
  removeButton: { marginTop: 8, alignItems: 'center' },
  removeButtonText: { color: '#d32f2f', fontWeight: 'bold' },
  buttonRow: { flexDirection: 'row', marginTop: 16, gap: 10 },
  button: { flex: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  cameraButton: { backgroundColor: '#1565c0' },
  galleryButton: { backgroundColor: '#6a1b9a' },
  slaRow: { gap: 8 },
  slaOption: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
  },
  slaOptionSelected: {
    borderColor: '#2e7d32',
    backgroundColor: '#e8f5e9',
  },
  slaOptionTitle: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  slaOptionTitleSelected: { color: '#1b5e20' },
  slaOptionDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  slaOptionDetailSelected: { color: '#2e7d32' },
  confirmButton: { backgroundColor: '#2e7d32', marginTop: 20 },
  disabledButton: { backgroundColor: '#a5d6a7' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});