import { StatusBar, StyleSheet, Text, View } from "react-native";

export function App() {
  return (
    <View style={styles.container}>
      <Text>Cresco</Text>
      <StatusBar barStyle="dark-content" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
