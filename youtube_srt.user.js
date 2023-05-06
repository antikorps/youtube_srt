// ==UserScript==
// @name         youtube_srt
// @namespace    youtube_srt
// @version      0.1
// @description  transcripciones de YouTube a subtítulos srt / YouTube transcriptions to srt subtitles
// @author       antikorps
// @match        https://www.youtube.com/*
// @icon         https://www.youtube.com/s/desktop/fa273944/img/favicon.ico
// @run-at document-idle
// @require https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.0/FileSaver.min.js
// @require https://cdnjs.cloudflare.com/ajax/libs/he/1.2.0/he.min.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function formatearDuracionSrt(segundos) {
        const milisegundos = parseFloat(segundos) * 1000
        const duracionFormateada = new Date(milisegundos).toISOString() // 1970-01-01T00:00:04.292Z
        return duracionFormateada.substring(11,23).replace(".", ",") // formato srt: 00:05:00,400
    }

    function convertirTituloNombre(cadena) {
        cadena = cadena.trim().replace(/\W/g,"_").replace(/_{2,}/g, "_").toLowerCase()
        if (cadena.length > 15) {
            return cadena.substring(0,15)
        }
        return cadena
    }

    async function descargarSub(evento) {
        const titulo = evento.target.getAttribute("data-titulo")

        const url = evento.target.getAttribute("data-url")
        const codigo = evento.target.getAttribute("data-codigo")

        let peticion = null
        let respuesta = ""
        try {
            peticion = await fetch(url)
            if (peticion.status != 200) {
                alert(`la petición para el xml de la transcripción ha recibido un status code incorrecto: ${peticion.status}`)
            }
            respuesta = await peticion.text()
        } catch(error) {
            alert(`no se ha podido obtener el xml de la transcripción vídeo: ${error}`)
            return
        }

        const parser = new DOMParser();
        const documento = parser.parseFromString(respuesta,"text/xml");

        let indice = 1
        let subtituloSrt = ""

        const lineas = documento.querySelectorAll("text")
        for (const linea of lineas) {
            const comienzo = parseFloat(linea.getAttribute("start"))
            const comienzoFormateado = formatearDuracionSrt(comienzo)
            const duracion = parseFloat(linea.getAttribute("dur"))
            const finFormateado = formatearDuracionSrt(comienzo + duracion)
            const contenido = he.decode(linea.textContent)

            const lineaSubtitulo = `${indice}
${comienzoFormateado} --> ${finFormateado}
${contenido}

`
            subtituloSrt += lineaSubtitulo
            indice++
        }

        let nombreFichero = `${convertirTituloNombre(titulo)}_${codigo}_`

        var blob = new Blob([subtituloSrt], {type: "text/plain;charset=utf-8"});
        saveAs(blob, nombreFichero + ".srt");
    }

    async function buscarTranscripciones() {
        /* El evento de click se ha incorporado al details
        si se hace click en su interior se volvería a disparar la función
        salir si ya hay antecedentes
        */
        if (document.querySelectorAll(".descargar-srt").length > 0) {
            return
        }

        /* La única variable global que he detectado que se actualizada apunta a la URL general
        realizando una petición se obtendrá el html donde ya se puede buscar la información
        de las transcripciones
        */
        const urlVideo = window.yt.player.utils.videoElement_.baseURI

        let peticion = null
        let respuesta = null
        try {
            peticion = await fetch(urlVideo)
            if (peticion.status != 200) {
                alert(`la petición para buscar las transcripciones ha recibido un status code incorrecto: ${peticion.status}`)
            }
            respuesta = await peticion.text()
        } catch(error) {
            alert(`no se ha podido obtener el código fuente de la página del vídeo: ${error}`)
            return
        }
        respuesta = respuesta.replace(/\n/g, "")

        let titulo = Date.now()

        const expRegTitulo = new RegExp("<title>(.*?)<\/title>", "m")
        if (expRegTitulo.test(respuesta)) {
            titulo = respuesta.replace(/.*?<title>(.*?)<\/title>.*/gm, "$1")
            titulo.replace(/"/g, "")
        }

        const infoTranscripciones = respuesta.replace(/.*?"captionTracks":.{0,2}(\[.*?\]).*/g, "$1")

        const infoTranscripcionesJSON = JSON.parse(infoTranscripciones)
        if (!Array.isArray(infoTranscripcionesJSON)) {
            alert(`error al interpretar el JSON con la información de las transcripciones: se esperaba un array. Comprobar la consola con la salida`)
            console.error("no se ha podido parsear la siguiente información", infoTranscripciones)
            return
        }

        let transcripcionesHTML = ""
        for (const transcripcion of infoTranscripcionesJSON) {
            const url = transcripcion.baseUrl
            const codigo = transcripcion.languageCode
            const nombre = transcripcion.name.simpleText
            transcripcionesHTML += `<p class="descargar-srt" style="margin-top:10px;cursor:pointer;" data-titulo="${titulo}" data-url="${url}" data-codigo="${codigo}">${nombre} (${codigo})</p>`
        }

        document.querySelector("#contenedor-srt").insertAdjacentHTML("beforeend", transcripcionesHTML)

        const botonesDescarga = document.querySelectorAll(".descargar-srt")
        for (const botonDescarga of botonesDescarga) {
            botonDescarga.addEventListener("click", descargarSub)
        }
    }

    /* Con cada ejecución hacer un botón nuevo para facilitar
    la gestión de eventos y evitar duplicidades */
    function prepararBotonDescarga() {
        let botonDescarga = document.querySelector("#contenedor-srt")
        if (botonDescarga != null) {
            botonDescarga.remove()
        }
        let selectorTitulo = document.querySelector("#above-the-fold #title")
        if (selectorTitulo != null) {
            const botonDescargaHTML = `
<details id="contenedor-srt" style="background: black; color: white; padding: 10px; font-size: medium; border-radius: 10px;display:inline-block;margin:10px auto 10px auto;">
    <summary style="cursor:pointer">Subs SRT</summary>
</details>
`
            selectorTitulo.insertAdjacentHTML("beforeend", botonDescargaHTML)
        }
        document.querySelector("#contenedor-srt").addEventListener("click", buscarTranscripciones)
    }

    /* La navegación entre vídeos es página única.
    Forzar la recarga del script cuando los datos cambien */
    window.addEventListener('yt-page-data-updated', function () {
        prepararBotonDescarga()
    });

})();
