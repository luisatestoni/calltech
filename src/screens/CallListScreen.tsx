import React, { useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db, ALUNO_ID } from '../firebase/config';

type Chamado = {
  id: string;
  description: string;
  photoUri?: string | null;
  address?: string | null;
  status: string;
  prioridade?: string;
  slaPrazo?: number;
  notificationId?: string | null;
};

function obterResumoSla(slaPrazo?: number, status?: string) {
  if (!slaPrazo || (status !== 'aberto' && status !== 'atendendo')) {
    return null;
  }

  const restanteMs = slaPrazo - Date.now();
  if (restanteMs <= 0) {
    return { texto: 'SLA esgotado!', cor: '#d32f2f', urgente: true };
  }

  const totalSegundos = Math.ceil(restanteMs / 1000);
  if (totalSegundos < 60) {
    return { texto: `SLA vence em ${totalSegundos}s`, cor: '#ed6c02', urgente: true };
  }

  const totalMinutos = Math.ceil(restanteMs / 60000);
  if (totalMinutos <= 15) {
    return { texto: `SLA vence em ${totalMinutos} min`, cor: '#ed6c02', urgente: true };
  }

  if (totalMinutos < 60) {
    return { texto: `SLA: ${totalMinutos} min restantes`, cor: '#2e7d32', urgente: false };
  }

  const horas = Math.floor(totalMinutos / 60);
  const mins = totalMinutos % 60;
  return {
    texto: mins > 0 ? `SLA: ${horas}h ${mins}m restantes` : `SLA: ${horas}h restantes`,
    cor: '#2e7d32',
    urgente: false,
  };
}

export default function CallListScreen({ navigation }: any) {
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const notificadosSessao = useRef<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let ativo = true;

      async function verificarSlaProximo(lista: Chamado[]) {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        const agora = Date.now();
        for (const item of lista) {
          const ativoChamado = item.status === 'aberto' || item.status === 'atendendo';
          if (!ativoChamado || !item.slaPrazo || item.notificationId) continue;

          const restanteMs = item.slaPrazo - agora;
          if (restanteMs > 0 && restanteMs <= 15 * 60 * 1000 && !notificadosSessao.current.has(item.id)) {
            notificadosSessao.current.add(item.id);
            await Notifications.scheduleNotificationAsync({
              content: {
                title: '⚠️ Prazo de SLA se esgotando!',
                body: `O chamado "${item.description}" vence em breve.`,
                data: { chamadoId: item.id },
                sound: 'default',
              },
              trigger: null,
            });
          }
        }
      }

      async function carregarChamados() {
        setLoading(true);
        try {
          const q = query(
            collection(db, 'alunos', ALUNO_ID, 'chamados'),
            orderBy('criadoEm', 'desc')
          );
          const snapshot = await getDocs(q);
          const lista = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Chamado));
          if (ativo) {
            setChamados(lista);
            verificarSlaProximo(lista);
          }
        } catch (error) {
          console.log('Erro ao carregar chamados', error);
        } finally {
          if (ativo) setLoading(false);
        }
      }

      carregarChamados();

      return () => {
        ativo = false;
      };
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={chamados}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.placeholderText}>Nenhum chamado registrado ainda</Text>
        }
        renderItem={({ item }) => {
          const sla = obterResumoSla(item.slaPrazo, item.status);
          return (
            <TouchableOpacity
              style={[styles.card, sla?.urgente && { borderColor: sla.cor, borderWidth: 1.5 }]}
              onPress={() => navigation.navigate('CallDetail', { chamadoId: item.id })}
            >
              <Text style={styles.cardTitle}>{item.description}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardStatus}>{item.status}</Text>
                {sla && (
                  <Text style={[styles.slaBadge, { color: sla.cor }]}>{sla.texto}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={styles.newButton}
        onPress={() => navigation.navigate('NewCall')}
      >
        <Text style={styles.newButtonText}>+ Novo Chamado</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 80 },
  placeholderText: { color: '#999', textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  cardStatus: { fontSize: 13, color: '#666', textTransform: 'uppercase' },
  slaBadge: { fontSize: 12, fontWeight: 'bold' },
  newButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  newButtonText: { color: '#fff', fontWeight: 'bold' },
});