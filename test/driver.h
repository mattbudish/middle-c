#include <string>
#include "car.h"

class RACE_CAR_DRIVER
{
    char name[20];
    int rank;
    int flag_status;
    std::string catch_phrase;
    car drivers_car;
};

void initCar(car *);

typedef car CAR_TYPE;
typedef CAR_TYPE obfuscatedCar;

void doThingToCar(obfuscatedCar *car);

