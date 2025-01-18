import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Dimensions, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, NativeEventEmitter, NativeModules } from 'react-native';
import BleManager,{Peripheral} from 'react-native-ble-manager';
import {Buffer} from 'buffer';

let serviceid="1800";
let caracid="2a00";
// let serviceIdForRead="1800"; deviceID read
// let charIdforRead="2a00"; deviceID read
// let serviceIdForWrite="1800"; WifiPassword write
// let charIdforWrite="2a00"; WifiPassword write

export default function App() {
  const [devices, setDevices] = useState<any[]>([]);
  const [paired, setPaired] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Peripheral>();
  const [messageToSend, setMessageToSend] = useState("");
  const [receivedMessage, setReceivedMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [intervalId, setIntervalId] = useState<NodeJS.Timer>();
  const [isScanning, setIsScanning] = useState(false);
  // const [ssid, setSsid] = useState("");
  const BleManagerModule = NativeModules.BleManager;
  const checkBluetoothEnabled = async () => {
    try {
      const state = await BleManager.checkState();
      if (state !== 'on') {
        await BleManager.enableBluetooth();
        console.log('Bluetooth is turned on!');
      }
    } catch (error) {
      console.error('Error managing Bluetooth:', error);
      handleBluetoothOff();
    }
  }
  const handleBluetoothOff = () => {
    // Clean up all Bluetooth-related state
    setIsConnected(false);
    setSelectedDevice(undefined);
    setReceivedMessage("");
    setDevices([]);
    setPaired([]);
    setIsScanning(false);
    if (intervalId) {
      clearInterval(intervalId as any);
      setIntervalId(undefined);
    }
  }
  const startDeviceDiscovery = async () => {
    setDevices([]);
    try {
      await BleManager.scan([], 10, false);
      console.log('Scanning...');
      setIsScanning(true);
      setTimeout(async () => {
        const peripheralsArray = await BleManager.getDiscoveredPeripherals();
        console.log("Discovered peripherals: " + peripheralsArray.length);
        setDevices(peripheralsArray);
        setIsScanning(false);
      }, 11000);
    } catch (error) {
      console.error('Error during device discovery:', error);
    }
  }
  const connectToDevice = async (device: Peripheral) => {
    BleManager.connect(device.id)
        .then(() => {
        // Success code
        console.log("Connected");
        setSelectedDevice(device);
        setIsConnected(true);
        BleManager.requestMTU(device.id, 256).then((MTU) => {
          console.log("MTU requested",MTU);
        })
        .catch((error) => {
          console.log("Error requesting MTU:", error);
        });
        BleManager.retrieveServices(device.id).then(
          (deviceInfo) => {
          // Success code
          console.log("Device info:", deviceInfo);
         console.log("Device id:", device.id);
         console.log("Device name:", device.name);
          printDeviceInfo(deviceInfo);
          }
        );
        })
        .catch((error) => {
        // Failure code
        console.log(error);
        });
  }
  const printDeviceInfo = (deviceInfo: any) => {
    if (!deviceInfo.characteristics) {
      console.log("No characteristics found");
      return;
    }
  
    // Group characteristics by service
    const serviceMap = new Map();
    deviceInfo.characteristics.forEach((char: any) => {
      if (!serviceMap.has(char.service)) {
        serviceMap.set(char.service, []);
      }
      serviceMap.get(char.service).push(char);
    });
  
    // Print formatted output
    console.log("\nDevice Services and Characteristics:");
    serviceMap.forEach((characteristics, service) => {
      console.log(`\nService: ${service}`);
      characteristics.forEach((char: any) => {
        console.log(`  Characteristic: ${char.characteristic}`);
        console.log(`    Properties: ${Object.keys(char.properties).join(", ")}`);
        if (char.descriptors) {
          console.log(`    Has Descriptors: Yes`);
        }
      });
    });
  }
  const sendMessage = async () => {
    if(selectedDevice && isConnected){
      try {
       const buffer = Buffer.from(messageToSend);
       BleManager.write(
         selectedDevice.id,
         serviceid,
         caracid,
         buffer.toJSON().data
       ).then(() => {
         // Success code
         console.log("Write: " + buffer.toJSON().data);
       })
       .catch((error) => {
         // Failure code
         console.log(error);
       });
        
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  }
  const readData = async () => {  
    if (selectedDevice && isConnected) {
       BleManager.read(
         selectedDevice.id,
         serviceid,
         caracid
       )
         .then((readData) => {
           // Success code
           console.log("Read: " + readData);
           const message = Buffer.from(readData);
           //const sensorData = buffer.readUInt8(1, true);
           if(receivedMessage.length>300){
             setReceivedMessage("");
           }
           setReceivedMessage(receivedMessage => receivedMessage + message +"\n" );
           console.log("receivedMessage length",receivedMessage.length)
         })
         .catch((error) => {
           // Failure code
           console.log("Error reading message:",error);
         });
    }
  }
  const disconnectFromDevice = (device: Peripheral) => {
    BleManager.disconnect(device.id)
    .then(() => {
         setSelectedDevice(undefined);
         setIsConnected(false);
         setReceivedMessage("");
         clearInterval(intervalId as any);
         console.log("Disconnected from device");
    })
    .catch((error) => {
      // Failure code
      console.log("Error disconnecting:",error);
    });
    
    /*BleManager.removeBond(peripheral.id)
      .then(() => {
        peripheral.connected = false;
        peripherals.set(peripheral.id, peripheral);
        setConnectedDevices(Array.from(peripherals.values()));
        setDiscoveredDevices(Array.from(peripherals.values()));
        Alert.alert(`Disconnected from ${peripheral.name}`);
      })
      .catch(() => {
        console.log('fail to remove the bond');
      });*/
  };
  useEffect(() => {
    const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
    
    const stateChangeListener = bleManagerEmitter.addListener(
      'BleManagerDidUpdateState',
      (args) => {
        try {
          // Defensive check for null/undefined args
          if (!args) {
            console.log('Received null/undefined state');
            handleBluetoothOff();
            return;
          }

          // Handle both possible state formats
          const state = typeof args === 'string' ? args : args.state;
          console.log('Bluetooth state changed:', state);
          
          // Handle all possible "off" states
          if (['off', 'turning_off', 'unauthorized', 'unknown'].includes(state)) {
            handleBluetoothOff();
          }
        } catch (error) {
          console.error('Error in state change listener:', error);
          // Safely handle any errors by assuming Bluetooth is off
          handleBluetoothOff();
        }
      }
    );

    // Make the interval check more robust
    const checkStateInterval = setInterval(() => {
      try {
        BleManager.checkState()
          .then((currentState) => {
            if (!currentState) {
              handleBluetoothOff();
              return;
            }
            console.log('Current BLE state:', currentState);
            if (currentState === 'off') {
              handleBluetoothOff();
            }
          })
          .catch(error => {
            console.error('Error checking BLE state:', error);
            handleBluetoothOff();
          });
      } catch (error) {
        console.error('Error in checkState interval:', error);
        handleBluetoothOff();
      }
    }, 5000);

    checkBluetoothEnabled();
    if (Platform.OS === 'android' && Platform.Version >= 23) {
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN)
            .then(checkResult => {
                if (!checkResult) {
                    PermissionsAndroid.requestMultiple([
                        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    ]).then(result => {
                        if (result['android.permission.BLUETOOTH_SCAN'] === 'granted' &&
                            result['android.permission.BLUETOOTH_CONNECT'] === 'granted' &&
                            result['android.permission.ACCESS_FINE_LOCATION'] === 'granted'
                        ) {
                            console.log('All permissions granted');
                            // Initialize BLE only after permissions are granted
                            initializeBLE();
                        } else {
                            console.log('Some permissions denied');
                        }
                    });
                } else {
                    // Permissions already granted, initialize BLE
                    initializeBLE();
                }
            });
    } else {
        initializeBLE();
    }
    BleManager.checkState().then((state) =>
      console.log(`current BLE state = '${state}'.`)
    );
    BleManager.getConnectedPeripherals([]).then((peripheralsArray) => {
      console.log("Connected peripherals: " + peripheralsArray.length);
    });
    BleManager.getBondedPeripherals().then((bondedPeripheralsArray) => {
      // Each peripheral in returned array will have id and name properties
      console.log("Bonded peripherals: " + bondedPeripheralsArray.length);
      //setBoundedDevices(bondedPeripheralsArray);
    });
    BleManager.getDiscoveredPeripherals().then((peripheralsArray) => {
      console.log("Discovered peripherals: " + peripheralsArray.length);
    });
    let stopDiscoverListener = bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      (peripheral) => {
        // Update devices list when a peripheral is discovered
        setDevices(prevDevices => {
          // Check if device already exists in the list
          const exists = prevDevices.some(device => device.id === peripheral.id);
          if (!exists) {
            return [...prevDevices, peripheral];
          }
          return prevDevices;
        });
      }
    );

    let stopScanListener = bleManagerEmitter.addListener(
   'BleManagerStopScan',
    () => {
      setIsScanning(false);
      console.log('scan stopped');
      }
    );
    let stopConnectListener = bleManagerEmitter.addListener(
      'BleManagerConnectPeripheral',
        peripheral => {
        console.log('BleManagerConnectPeripheral:', peripheral);
        peripheral.set(peripheral.id, peripheral);
      },
    );
    let characteristicValueUpdate = bleManagerEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
        data => {
          console.log('BleManagerDidUpdateValueForCharacteristic:', data);
      },
    );
    return () => {
      try {
        if (stateChangeListener?.remove) {
          stateChangeListener.remove();
        }
        if (checkStateInterval) {
          clearInterval(checkStateInterval);
        }
        stopDiscoverListener.remove();
        stopConnectListener.remove();
        stopScanListener.remove();
        characteristicValueUpdate.remove();
      } catch (error) {
        console.error('Error in cleanup:', error);
      }
    };
  }, [intervalId]);
const initializeBLE = () => {
    BleManager.start({showAlert: false}).then(() => {
        console.log('BleManager initialized');
        // startDeviceDiscovery();
    }).catch((error) => {
        console.log("Error initializing BLE:", error);
    });
    
}

return (
  <View style={[styles.mainBody]}>
  <Text
        style={{
          fontSize: 30,
          textAlign: 'center',
          borderBottomWidth: 1,
        }}>
        AC BLE Terminal
      </Text>
    <ScrollView>
      {!isConnected && (
      <>
         <TouchableOpacity
                    onPress={() => startDeviceDiscovery()
                    }
                    style={[styles.deviceButton]}>
                    <Text
                      style={[
                        styles.scanButtonText,
                      ]}>
                      {isScanning ? 'SCANNING...' : 'SCAN'}
                    </Text>
           </TouchableOpacity>
      
           <Text>Available Devices:</Text>
           {devices.map((device) => (
             <TouchableOpacity
               key={device.id}
               onPress={() => connectToDevice(device)}
               style={styles.deviceButton}
             >
               <Text style={styles.deviceName}>{device.name || 'Unnamed Device'}</Text>
             </TouchableOpacity>
           ))}
     
      <Text>Paired Devices:</Text>
      {paired.map((pair,i) => (
                  <View key={i}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginBottom: 2,
                  }}>
                  <View style={styles.deviceItem}>
                    <Text style={styles.deviceName}>{pair.name}</Text>
                    <Text style={styles.deviceInfo}>{pair.id}, rssi: {pair.rssi}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      isConnected
                        ?  disconnectFromDevice(pair)
                        :  connectToDevice(pair)
                    }
                    style={styles.deviceButton}>
                    <Text
                      style={[
                        styles.scanButtonText,
                        {fontWeight: 'bold', fontSize: 12},
                      ]}>
                      {isConnected ? 'Disconnect' : 'Connect'}
                    </Text>
                  </TouchableOpacity>
                </View>
      ))}
      </>  
      )}
      {selectedDevice && isConnected && (
        <>
          <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    margin: 5,
                  }}>
                  <View style={styles.deviceItem}>
                    <Text style={styles.deviceName}>{selectedDevice.name}</Text>
                    <Text style={styles.deviceInfo}>{selectedDevice.id}, rssi: {selectedDevice.rssi}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      isConnected
                        ?  disconnectFromDevice(selectedDevice)
                        :  connectToDevice(selectedDevice)
                    }
                    style={styles.deviceButton}>
                    <Text
                      style={styles.scanButtonText}>
                      {isConnected ? 'Disconnect' : 'Connect'}
                    </Text>
                  </TouchableOpacity>
                </View>
      <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            margin: 5,
          }}>        
          <TextInput
            style={{
              backgroundColor: '#888888',
              margin: 2,
              borderRadius: 15,
              flex:3,
              color: '#FFFFFF',
              textAlign: 'center',
              }}
            placeholder="Enter a message"
            value={messageToSend}
            onChangeText={(text) => setMessageToSend(text)}
          />
          <TouchableOpacity
                    onPress={() => sendMessage()
                    }
                    style={[styles.sendButton]}>
                    <Text
                      style={[
                        styles.scanButtonText,
                      ]}>
                      SEND
                    </Text>
                  </TouchableOpacity>
    </View>
    <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            margin: 5,
          }}>
          <Text style={{textAlignVertical: 'center'}}>Received Message:</Text>
          <TouchableOpacity
                    onPress={() => readData()
                    }
                    style={[styles.deviceButton]}>
                    <Text
                      style={[
                        styles.scanButtonText,
                      ]}>
                      READ
                    </Text>
           </TouchableOpacity>
     </View>
     <TextInput
            editable={false}
            multiline
            numberOfLines={20}
            maxLength={300}
            value={receivedMessage}
            style={{
              backgroundColor: '#333333',
              margin: 10,
              borderRadius: 2,
              borderWidth: 1,
              borderColor: '#EEEEEE',
              textAlign: 'left',
              padding: 10,
              color: '#FFFFFF',
              fontSize: 14,
              textAlignVertical: 'top',
              minHeight: 200,
              maxHeight: 300,
              height: 'auto',
            }}>
          </TextInput>
        </>
      )}
    </ScrollView>
  </View>
);
};
//https://medium.com/supercharges-mobile-product-guide/reactive-styles-in-react-native-79a41fbdc404
export const theme = {
smallPhone: 0,
phone: 290,
tablet: 750,
}
const windowHeight = Dimensions.get('window').height;
const styles = StyleSheet.create({
mainBody: {
flex: 1,
backgroundColor: '#000000',
justifyContent: 'center',
height: windowHeight,
...Platform.select ({
 ios: {
   fontFamily: "Arial",
 },
 
 android: {
   fontFamily: "Roboto",
 },
}),
},
scanButtonText: {
color: 'white',
fontWeight: 'bold',
fontSize: 12,
textAlign: 'center',
},
noDevicesText: {
textAlign: 'center',
marginTop: 10,
fontStyle: 'italic',
},
deviceItem: {
marginBottom: 2,
backgroundColor: '#000000',
},
deviceName: {
fontSize: 14,
fontWeight: 'bold',
color: '#FFFFFF',
},
deviceInfo: {
fontSize: 8,
color: '#FFFFFF',
},
deviceButton: {
backgroundColor: '#2196F3',
padding: 10,
borderRadius: 10,
margin: 2,
paddingHorizontal: 20,
},
sendButton: {
backgroundColor: '#2196F3',
padding: 15,
borderRadius: 15,
margin: 2,
paddingHorizontal: 20,
},
});
