// 1. Configuración con tu URL de Firebase
const firebaseConfig = {
    databaseURL: "https://project-dc-pt100-default-rtdb.firebaseio.com/"
};

// 2. Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 3. Referencia a la etiqueta donde mostraremos el valor
const tempElement = document.getElementById('temp-val');
const statusElement = document.getElementById('status-label');

// 4. Escuchar cambios en la rama "sensor"
db.ref('sensor').on('value', (snapshot) => {
    const data = snapshot.val();
    
    if (data && data.temperatura !== undefined) {
        // Actualizamos el número en la pantalla
        tempElement.innerText = data.temperatura;
        statusElement.innerText = "● En línea (Recibiendo datos)";
        
        // Pequeño efecto visual de parpadeo al actualizar
        tempElement.style.opacity = "0.5";
        setTimeout(() => { tempElement.style.opacity = "1"; }, 100);
    }
}, (error) => {
    console.error("Error de Firebase:", error);
    statusElement.innerText = "Error de conexión";
    statusElement.style.color = "#ef4444";
});