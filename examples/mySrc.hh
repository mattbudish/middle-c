#include <cstdint>
#include <vector>

template <typename T>
class typeWrapper
{
public:
    T myType;
};

void twFun(typeWrapper<int> *wrappedInt);

typedef std::vector<int> ivec;

int vectorFun(ivec *iv);

typedef struct myStruct
{
    int32_t id;
    char payload[80];
} MY_STRUCT;

char *myPayload(MY_STRUCT *);

namespace myMath
{
    int sum(int, int);
    class myRec
    {
    public:
        char *name;
        int value;
        void doSomethingToThis();
    };

    int initRec(myRec *);
}

class car
{
    char modelName[80];
    double weight;
    car();
    ~car();
};

void initCar(car *);

typedef car CAR_TYPE;
typedef CAR_TYPE obfuscatedCar;

void doThingToCar(obfuscatedCar *car);

