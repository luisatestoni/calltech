import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, ALUNO_ID } from '../firebase/config';

type Chamado = {
  description: string;
  photoUri?: string | null;
  address?: string | null;
  status: string;
};

export default function CallDetailScreen({ route }: any) {
  const { chamadoId } = route.params;
  const [chamado, setChamado] = useState<Chamado | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function carregarChamado() {
      try {
        setLoading(true);
        const docRef = doc(db, 'alunos', ALUNO_ID, 'chamados', chamadoId);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists()) {
          setChamado(snapshot.data() as Chamado);
        } else {
          Alert.alert('Erro', 'Chamado não encontrado.');
        }
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível carregar os detalhes do chamado.');
        console.log(error);
      } finally {
        setLoading(false);
      }
    }

    carregarChamado();
  }, [chamadoId]);

  async function mudarStatus(novoStatus: string) {
    try {
      setUpdating(true);
      const docRef = doc(db, 'alunos', ALUNO_ID, 'chamados', chamadoId);
      
      await updateDoc(docRef, { status: novoStatus });
      
      // Atualiza o estado local imediatamente sem precisar recarregar tudo
      setChamado((prev) => (prev ? { ...prev, status: novoStatus } : null));
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível atualizar o status.');
      console.log(error);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!chamado) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>Chamado não encontrado.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.label}>Descrição</Text>
        <Text style={styles.value}>{chamado.description}</Text>

        <Text style={styles.label}>Status atual</Text>
        <Text style={styles.statusValue}>{chamado.status}</Text>

        {chamado.address && (
          <>
            <Text style={styles.label}>Endereço</Text>
            <Text style={styles.value}>{chamado.address}</Text>
          </>
        )}

        {chamado.photoUri && (
          <>
            <Text style={styles.label}>Foto</Text>
            <Image source={{ uri: chamado.photoUri }} style={styles.image} resizeMode="cover" />
          </>
        )}
      </View>

      {/* Ações condicionais ao status atual */}
      <View style={styles.actionsContainer}>
        {updating ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <>
            {chamado.status === 'aberto' && (
              <TouchableOpacity
                style={[styles.button, styles.btnStart]}
                onPress={() => mudarStatus('atendendo')}
              >
                <Text style={styles.buttonText}>Iniciar Atendimento</Text>
              </TouchableOpacity>
            )}

            {chamado.status === 'atendendo' && (
              <TouchableOpacity
                style={[styles.button, styles.btnDone]}
                onPress={() => mudarStatus('concluido')}
              >
                <Text style={styles.buttonText}>Concluir Atendimento</Text>
              </TouchableOpacity>
            )}

            {(chamado.status === 'aberto' || chamado.status === 'atendendo') && (
              <TouchableOpacity
                style={[styles.button, styles.btnCancel]}
                onPress={() => mudarStatus('cancelado')}
              >
                <Text style={styles.buttonText}>Cancelar Chamado</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 16, color: '#666' },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 20 },
  label: { fontSize: 12, color: '#888', marginTop: 12, fontWeight: 'bold' },
  value: { fontSize: 16, color: '#333', marginTop: 2 },
  statusValue: { fontSize: 15, color: '#2e7d32', marginTop: 2, fontWeight: 'bold', textTransform: 'uppercase' },
  image: { width: '100%', height: 200, borderRadius: 8, marginTop: 8 },
  actionsContainer: { gap: 10 },
  button: { padding: 14, borderRadius: 8, alignItems: 'center' },
  btnStart: { backgroundColor: '#0288d1' },
  btnDone: { backgroundColor: '#2e7d32' },
  btnCancel: { backgroundColor: '#d32f2f' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});