import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';

const districtData = {
  // மேலேயுள்ள அதே JavaScript districtData Object-ஐ இங்கும் வைக்கலாம்...
};

export default function LocationPicker() {
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedConstituency, setSelectedConstituency] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.label}>மாவட்டத்தை தேர்ந்தெடுக்கவும்:</Text>
      <Picker
        selectedValue={selectedDistrict}
        onValueChange={(itemValue) => {
          setSelectedDistrict(itemValue);
          setSelectedConstituency(''); // Reset constituency on district change
        }}>
        <Picker.Item label="-- மாவட்டம் தேர்வு செய் --" value="" />
        {Object.keys(districtData).map((district) => (
          <Picker.Item key={district} label={district} value={district} />
        ))}
      </Picker>

      <Text style={styles.label}>தொகுதியை தேர்ந்தெடுக்கவும்:</Text>
      <Picker
        selectedValue={selectedConstituency}
        enabled={!!selectedDistrict}
        onValueChange={(itemValue) => setSelectedConstituency(itemValue)}>
        <Picker.Item label="-- தொகுதி தேர்வு செய் --" value="" />
        {selectedDistrict &&
          districtData[selectedDistrict]?.map((constituency) => (
            <Picker.Item key={constituency} label={constituency} value={constituency} />
          ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: { fontSize: 16, fontWeight: 'bold', marginTop: 15 }
});
