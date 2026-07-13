import { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { C, commonStyles } from '../../lib/theme';

type Row = { range: number; drop_in: number; adj: number; wind_in: number; wind_adj: number; vel: number };

function calcG1(mv: number, bc: number, bw: number, zero: number, ws: number, ranges: number[], unit: 'moa' | 'mrad'): Row[] {
  const g = 32.174;
  const mult = unit === 'moa' ? 1.047 : 0.2909;
  const windComp = ws;
  return ranges.map(yd => {
    const ft = yd * 3;
    const retard = 1 / bc;
    const tof = (ft / mv) * (1 + retard * ft / (2 * mv));
    const vel = mv * Math.exp(-retard * ft / mv);
    const drop = 0.5 * g * tof * tof;
    const zft = zero * 3;
    const ztof = (zft / mv) * (1 + retard * zft / (2 * mv));
    const zdrop = 0.5 * g * ztof * ztof;
    const netIn = (drop - zdrop) * 12;
    const adj = yd > 0 ? netIn / (yd * mult) : 0;
    const lagTime = tof - ft / mv;
    const windIn = windComp * lagTime * 12;
    const windAdj = yd > 0 ? windIn / (yd * mult) : 0;
    return {
      range: yd,
      drop_in:  Math.round(netIn    * 10) / 10,
      adj:      Math.round(adj      * 10) / 10,
      wind_in:  Math.round(windIn   * 10) / 10,
      wind_adj: Math.round(windAdj  * 10) / 10,
      vel:      Math.round(vel),
    };
  });
}

export default function Ballistics() {
  const [mv,   setMv]   = useState('2850');
  const [bc,   setBc]   = useState('0.535');
  const [bw,   setBw]   = useState('175');
  const [zero, setZero] = useState('100');
  const [ws,   setWs]   = useState('10');
  const [unit, setUnit] = useState<'moa'|'mrad'>('moa');
  const [rows, setRows] = useState<Row[]>([]);

  const calc = () => {
    const ranges = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    setRows(calcG1(+mv, +bc, +bw, +zero, +ws, ranges, unit));
  };

  const field = (label: string, val: string, set: (v: string) => void, placeholder: string) => (
    <View style={styles.fieldWrap} key={label}>
      <Text style={commonStyles.label}>{label}</Text>
      <TextInput style={commonStyles.input} value={val} onChangeText={set}
        placeholderTextColor={C.muted} placeholder={placeholder} keyboardType="numeric" />
    </View>
  );

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.sectionTitle}>G1 DROP CALCULATOR</Text>

      <View style={styles.row}>{field('Muzzle Vel (fps)', mv, setMv, '2850')}{field('BC (G1)', bc, setBc, '0.535')}</View>
      <View style={styles.row}>{field('Bullet Wt (gr)', bw, setBw, '175')}{field('Zero (yd)', zero, setZero, '100')}</View>
      <View style={styles.row}>{field('Wind (mph)', ws, setWs, '10')}</View>

      <View style={styles.unitRow}>
        {(['moa', 'mrad'] as const).map(u => (
          <TouchableOpacity key={u} style={[styles.unitBtn, unit === u && styles.unitBtnActive]} onPress={() => setUnit(u)}>
            <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>{u.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={commonStyles.primaryBtn} onPress={calc}>
        <Text style={commonStyles.primaryBtnText}>Calculate</Text>
      </TouchableOpacity>

      {rows.length > 0 && (
        <>
          <Text style={commonStyles.sectionTitle}>RESULTS — zero {zero}yd · {ws}mph wind</Text>
          <View style={styles.tableHeader}>
            {['Range', 'Drop"', unit.toUpperCase(), 'Wind"', 'Vel'].map(h => (
              <Text key={h} style={styles.th}>{h}</Text>
            ))}
          </View>
          {rows.map((r, i) => (
            <View key={r.range} style={[styles.tableRow, i % 2 === 0 && styles.tableRowEven]}>
              <Text style={styles.td}>{r.range}</Text>
              <Text style={styles.td}>{r.drop_in}</Text>
              <Text style={[styles.td, { color: C.accent }]}>{r.adj}</Text>
              <Text style={styles.td}>{r.wind_adj}</Text>
              <Text style={styles.td}>{r.vel}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row:          { flexDirection: 'row', gap: 10 },
  fieldWrap:    { flex: 1 },
  unitRow:      { flexDirection: 'row', gap: 8, marginBottom: 12 },
  unitBtn:      { flex: 1, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center' },
  unitBtnActive:{ backgroundColor: C.accent + '22', borderColor: C.accent },
  unitText:     { color: C.muted, fontWeight: '600' },
  unitTextActive:{ color: C.accent },
  tableHeader:  { flexDirection: 'row', backgroundColor: C.card, padding: 10, borderRadius: 4, marginTop: 8 },
  tableRow:     { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  tableRowEven: { backgroundColor: C.surface },
  th:           { flex: 1, fontSize: 10, fontWeight: '700', color: C.accent, textTransform: 'uppercase' },
  td:           { flex: 1, fontSize: 13, color: C.text },
});
