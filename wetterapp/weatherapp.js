function fetchData() {
    let cityInput = document.getElementById("city").value;

    if(!cityInput) {
        document.getElementById("cityname").innerHTML = "";
        document.getElementById("date").innerHTML = "";
        document.getElementById("temp").innerHTML = "";
        document.getElementById("weathericon").src = "";
        document.getElementById("weathertext").innerHTML = "";
        document.getElementById("minmaxtemp").innerHTML = "";
    } else {
        fetch("https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/" + cityInput + "?unitGroup=metric&key=YRKC76PEM83DV5L9BP7WGS63K&contentType=json", {
            method: 'GET',
            headers: {},
        }).then(response => {
            if (!response.ok) {
                throw response;
            }
            return response.json();
        }).then(response => {
            processWeatherData(response);
        }).catch((errorResponse) => {
            if (errorResponse.text) {
                errorResponse.text().then(errorMessage => {
                    console.log(errorMessage)
                })
            }
        });
    }
}

function processWeatherData(response) {
    let days = response.days;
    let current = response.currentConditions;
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    let date = new Date();

    document.getElementById("cityname").innerHTML = response.resolvedAddress;
    document.getElementById("date").innerHTML = date.toLocaleDateString("en-US", options);
    document.getElementById("temp").innerHTML = Math.floor(current.temp) + "°C";
    document.getElementById("weathericon").src = "weathericons/" + current.icon + ".png";
    document.getElementById("weathericon").title = current.conditions;
    document.getElementById("weathertext").innerHTML = current.conditions;
    document.getElementById("minmaxtemp").innerHTML = Math.floor(days[0].tempmin) + "°C / " + Math.floor(days[0].tempmax) + "°C";
}

const processChange = debounce(fetchData, 200);

function debounce(func, timeout = 200) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            func.apply(this, args);
        }, timeout);
    };
}